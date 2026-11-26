const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const { computeAndStoreReliability } = require("../services/reliability");

const { repetitionsDans } = require("../services/nomsDoublons");
const { construireModeleListePresence } = require("../services/modeleListePresence");
/* La detection des doublons d'une liste : noms (ordre, accents, variantes,
   fautes), numeros et adresses normalises, contacts collectifs, homonymes
   attendus sur les grandes listes. Elle vit a part pour etre eprouvee sans
   base ni fichier. */
const {
  analyserDoublons, regrouper, preparer, comparer, contactsCollectifs, telephonesDe,
} = require("../services/doublonsListe");

const router = express.Router();

/* ===== UPLOAD CONFIG ===== */
const uploadDir = process.env.UPLOAD_DIR || "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXCEL_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel",                                          // .xls
  "application/octet-stream",                                          // certains navigateurs envoient ça pour xlsx
]);
const ALLOWED_EXCEL_EXTS = new Set([".xlsx", ".xls"]);

const upload = multer({
  dest: `${uploadDir}/`,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXCEL_MIMES.has(file.mimetype) || ALLOWED_EXCEL_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Fichier Excel requis (.xlsx ou .xls)"), { status: 400 }));
    }
  },
});

function safeUnlink(path) {
  if (!path) return;
  fs.unlink(path, () => {});
}

/* ===== NORMALISATION ===== */

function normalizeKey(raw) {
  if (raw == null) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^a-z0-9\s]/g, " ")      // any non-alphanum → space
    .replace(/\s+/g, "_")              // spaces → underscore
    .replace(/_+/g, "_")               // collapse multiple underscores
    .replace(/^_|_$/g, "");            // trim leading/trailing underscores
}

function normalizeGender(value) {
  if (!value) return null;
  const v = normalizeKey(String(value));
  if (["m", "h", "homme", "male", "masculin"].includes(v)) return "H";
  if (["f", "femme", "female", "feminin"].includes(v)) return "F";
  return null;
}

/* Une adresse email ne vaut que par ce qu'elle designe : « Rockaya@Example.com »
   et « rockaya@example.com  » sont la meme boite. On la range donc toujours sous
   la meme forme, sinon l'index d'unicite laisse passer deux fois la meme
   personne et la campagne lui ecrit deux fois. */
function normalizeEmail(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim().toLowerCase();
  return v || null;
}

function normalizePhone(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v || null;
}

/* ===== RÉSOLUTION DE CHAMPS : alias + pattern + Levenshtein ===== */

const FIELD_ALIASES = {
  nom: [
    "nom", "last_name", "name", "nom_de_famille", "surname", "noms",
    "family_name", "nom_participant", "nom_beneficiaire", "nom_etudiant",
  ],
  prenom: [
    "prenom", "first_name", "firstname", "prenoms", "given_name",
    "prenom_s", "prenom_participant", "prenom_beneficiaire",
  ],
  nom_complet: [
    "nom_complet", "nom_et_prenom", "prenom_nom", "nom_prenom",
    "full_name", "nomcomplet", "prenom_et_nom", "identite",
    "nom_prenom_participant", "participant", "beneficiaire",
    "nom_prenoms", "prenoms_et_nom",
  ],
  genre: [
    "genre", "gender", "sexe", "civilite", "sex", "m_f",
    "masculin_feminin", "genre_sexe",
  ],
  email: [
    "email", "e_mail", "mail", "courriel", "adresse_mail",
    "adresse_email", "email_address", "adresse_electronique",
    "adresse_e_mail",
  ],
  telephone: [
    "telephone", "phone", "tel", "portable", "mobile",
    "n_telephone", "n_de_telephone", "gsm", "num_tel",
    "numero_telephone", "numero_de_telephone", "numero_de_tel",
    "n_tel", "no_telephone", "tel_portable", "tel_mobile",
    "telephone_portable", "numero_de_portable", "contact",
  ],
  structure: [
    "structure", "etablissement", "ecole", "universite", "organisation",
    "entreprise", "institution", "societe", "organisme",
    "lieu_de_travail", "organisme_de_rattachement",
    "etablissement_scolaire", "nom_etablissement",
    "structure_de_rattachement", "etablissement_entreprise",
  ],
  tranche_age: [
    "tranche_age", "tranche_dage", "tranche_age_", "age_range", "age",
    "ages", "tranches_dage", "tranche", "age_beneficiaire",
    "tranche_d_age", "groupe_age",
  ],
  statut: [
    "statut", "status", "categorie", "type", "type_participant",
    "profil", "qualite", "type_beneficiaire",
  ],
  activite: [
    "activite", "activity", "nom_activite", "intitule",
    "intitule_activite", "formation", "titre_activite",
  ],
  date_activite: [
    "date_activite", "activity_date", "date", "date_formation",
    "date_de_lactivite", "date_de_la_formation",
  ],
};

// Regex patterns pour correspondance sémantique (quand l'alias exact ne suffit pas)
const FIELD_PATTERNS = {
  telephone: [/tel$/, /^tel_/, /_tel$/, /phone/, /portable/, /mobile/, /^gsm/, /^n_tel/, /^no_tel/, /^num_tel/],
  email:     [/mail/, /courriel/],
  structure: [/^etabl/, /^ecole$/, /^univ/, /^organ/, /^entrepri/, /^instit/, /^societ/, /nom_etab/],
  tranche_age: [/tranche/, /^age$/, /^ages$/],
  nom_complet: [/complet/, /identite/, /^participant$/, /^beneficiaire$/],
  genre:     [/^sexe$/, /genre_/],
};

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function resolveField(rawKey) {
  const key = normalizeKey(String(rawKey ?? ""));
  if (!key || key.length < 2 || /^\d+$/.test(key)) return null;

  // 1. Exact alias match
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(key)) return field;
  }

  // 2. Regex pattern match
  for (const [field, patterns] of Object.entries(FIELD_PATTERNS)) {
    for (const pat of patterns) {
      if (pat.test(key)) return field;
    }
  }

  // 3. Levenshtein ≤ 1 (uniquement pour clés ≥ 6 chars pour éviter les faux positifs)
  if (key.length >= 6) {
    let bestField = null;
    let bestDist = 2; // seuil strict
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const alias of aliases) {
        if (alias.length < 5) continue;
        const dist = levenshtein(key, alias);
        if (dist < bestDist) { bestDist = dist; bestField = field; }
      }
    }
    if (bestField) return bestField;
  }

  return null;
}

/* ===== DÉTECTION INTELLIGENTE DE LA LIGNE D'EN-TÊTE ===== */

function findHeaderRowIndex(rawRows) {
  const maxScan = Math.min(6, rawRows.length);
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < maxScan; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    let score = 0;
    for (const cell of row) {
      if (cell != null && resolveField(String(cell))) score++;
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
    if (bestScore >= 2) break; // 2 colonnes reconnues = ligne d'en-tête fiable
  }
  return bestIdx;
}

function buildColumnMapping(headerRow, manualMapping = {}) {
  const usedFields = new Set();
  return headerRow.map((cell) => {
    const original = String(cell ?? "").trim();
    // Priorité au mapping manuel fourni par l'utilisateur
    const manualField = manualMapping[original];
    if (manualField && !usedFields.has(manualField)) {
      usedFields.add(manualField);
      return { field: manualField, original };
    }
    const field = resolveField(original);
    if (field && !usedFields.has(field)) {
      usedFields.add(field);
      return { field, original };
    }
    return { field: null, original };
  });
}

/* ===== SPLIT "NOM COMPLET" INTELLIGENT ===== */

function splitNomComplet(full) {
  if (!full || !String(full).trim()) return { nom: null, prenom: null };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { nom: parts[0], prenom: null };

  const isAllCaps = (s) => s.length > 1 && s === s.toUpperCase() && /[A-ZÀ-Ö]/.test(s);
  const firstCaps = isAllCaps(parts[0]);
  const lastCaps = isAllCaps(parts[parts.length - 1]);

  if (firstCaps && !lastCaps) {
    // "DIALLO Aminata" → nom=DIALLO, prenom=Aminata
    return { nom: parts[0], prenom: parts.slice(1).join(" ") };
  }
  if (!firstCaps && lastCaps) {
    // "Aminata DIALLO" → prenom=Aminata, nom=DIALLO
    return { nom: parts[parts.length - 1], prenom: parts.slice(0, -1).join(" ") };
  }
  // Convention par défaut : premier mot = nom (ordre administratif francophone)
  return { nom: parts[0], prenom: parts.slice(1).join(" ") };
}

/* ===== LECTURE DU FICHIER EXCEL ===== */

function parseRowsFromSheet(sheet, manualMapping = {}) {
  const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rawRows.length === 0) {
    return { rows: [], headerRowIndex: 0, recognizedColumns: {}, unrecognizedColumns: [] };
  }

  const headerIdx = findHeaderRowIndex(rawRows);
  const headerRow = rawRows[headerIdx].map((c) => (c != null ? String(c) : ""));
  const colMapping = buildColumnMapping(headerRow, manualMapping);

  // Rapport des colonnes reconnues / non reconnues
  const recognizedColumns = {};
  const unrecognizedColumns = [];
  for (const { field, original } of colMapping) {
    if (!original.trim()) continue;
    if (field && !["activite", "date_activite"].includes(field)) {
      recognizedColumns[field] = original;
    } else if (!field) {
      unrecognizedColumns.push(original);
    }
  }

  /* Convertir les lignes de données en objets, en gardant le numéro de ligne
     Excel : c'est par lui que l'écran désigne un doublon (« lignes 14 et
     87 »), et qu'on le retrouve dans le fichier. */
  const debut = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]).s.r : 0;
  const rows = [];
  for (let r = headerIdx + 1; r < rawRows.length; r++) {
    const rawRow = rawRows[r];
    if (!Array.isArray(rawRow) || !rawRow.some((c) => c != null && String(c).trim() !== "")) continue;
    const obj = {};
    colMapping.forEach(({ field }, idx) => {
      if (field) obj[field] = rawRow[idx] ?? null;
    });
    Object.defineProperty(obj, "__ligneExcel", { value: debut + r + 1, enumerable: false });
    rows.push(obj);
  }

  return { rows, headerRowIndex: headerIdx, recognizedColumns, unrecognizedColumns };
}

function parseParticipantFromMapped(obj) {
  let nom = obj.nom ? String(obj.nom).trim() : null;
  let prenom = obj.prenom ? String(obj.prenom).trim() : null;

  // Repli sur nom_complet si nom ou prenom manquant
  if ((!nom || !prenom) && obj.nom_complet) {
    const split = splitNomComplet(obj.nom_complet);
    if (!nom) nom = split.nom;
    if (!prenom) prenom = split.prenom;
  }

  const clean = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);

  return {
    nom: clean(nom),
    prenom: clean(prenom),
    genre: clean(obj.genre),
    email: normalizeEmail(obj.email),
    telephone: normalizePhone(obj.telephone),
    statut: clean(obj.statut),
    structure: clean(obj.structure),
    ageRange: clean(obj.tranche_age),
  };
}

/* ===== LECTURE DES LIGNES =====
   Une ligne n'est ecartee que si elle ne designe personne. L'import exigeait
   auparavant un nom ET un prenom : une feuille de presence ou quelqu'un
   n'avait ecrit que son nom de famille perdait cette personne — sans que rien
   ne la remplace dans les compteurs. On garde donc toute ligne portant de quoi
   designer quelqu'un : un nom, un prenom, une adresse ou un numero. Ce qui
   manque reste vide et se voit. */
function lireLignes(rows) {
  let skippedMissingName = 0;
  const items = [];
  const lignesIncompletes = [];
  rows.forEach((row, ligne) => {
    const p = parseParticipantFromMapped(row);
    if (!p.nom && !p.prenom && !p.email && !p.telephone) { skippedMissingName++; return; }
    if (!p.nom || !p.prenom) {
      lignesIncompletes.push({
        nom: p.nom || null,
        prenom: p.prenom || null,
        email: p.email || null,
        telephone: p.telephone || null,
        ligne_excel: row.__ligneExcel ?? null,
        manque: [!p.nom && "nom", !p.prenom && "prénom"].filter(Boolean),
      });
    }
    items.push({
      ...p,
      /* Les colonnes nom et prenom n'acceptent pas l'absence de valeur : une
         chaine vide dit « non renseigne » sans rien inventer. */
      nom: p.nom || "",
      prenom: p.prenom || "",
      normalizedGender: normalizeGender(p.genre),
      /* La position dans le fichier : c'est par elle que l'ecran designe les
         lignes a reunir, et par le numero Excel qu'on les retrouve. */
      ligne,
      ligneExcel: row.__ligneExcel ?? null,
    });
  });
  return { items, skippedMissingName, lignesIncompletes };
}

const nomAffiche = (p) => `${p.prenom || ""} ${p.nom || ""}`.trim();

/* Les groupes de doublons, tels que l'ecran les montre : chaque ligne avec son
   numero Excel, son nom et ses contacts. Les indices renvoyes sont les
   positions dans le fichier, celles que l'ecran renverra pour dire quoi
   reunir. */
function detaillerGroupes(groupes, items) {
  const decrire = (k) => ({
    ligne: items[k].ligne,
    ligne_excel: items[k].ligneExcel,
    nom: items[k].nom || null,
    prenom: items[k].prenom || null,
    email: items[k].email || null,
    telephone: items[k].telephone || null,
    genre: items[k].normalizedGender || null,
    tranche_age: items[k].ageRange || null,
  });
  return groupes.map((g) => ({
    id: g.id,
    niveau: g.niveau,
    defaut: g.defaut,
    raisons: g.raisons,
    lignes: g.lignes.map((k) => items[k].ligne),
    cotes: g.cotes ? g.cotes.map((c) => c.map((k) => items[k].ligne)) : null,
    detail: g.lignes.map(decrire),
  }));
}

/* Ce que l'ecran a decide de reunir : une liste d'ensembles de positions dans
   le fichier. Absente, ce sont les reunions par defaut (doublons certains et
   probables) qui s'appliquent. */
function lireFusions(req) {
  const brut = req.body?.fusions;
  if (brut === undefined || brut === null || brut === "") return null;
  try {
    const v = typeof brut === "string" ? JSON.parse(brut) : brut;
    if (!Array.isArray(v)) return null;
    return v
      .filter(Array.isArray)
      .map((e) => e.map(Number).filter(Number.isInteger))
      .filter((e) => e.length >= 2);
  } catch {
    return null;
  }
}

/* Ce qu'une ligne apporte a une autre qui designe la meme personne :
   seulement ce qui manque. Deux lignes d'un meme fichier peuvent porter l'une
   l'adresse, l'autre le numero — la fiche doit recevoir les deux. */
const CHAMPS_LIGNE = ["nom", "prenom", "email", "telephone", "normalizedGender", "ageRange", "statut", "structure"];

/**
 * Importe les lignes d'une liste de presence dans une activite.
 *
 * Une liste est un document a part entiere. Elle ne se fond pas dans les
 * autres : l'import ne cherche plus la personne dans le reste de la base.
 *
 * Il le faisait. Une personne deja connue — par son adresse, son numero, ou
 * par son seul nom quand la fiche existante n'avait pas de contact — etait
 * reconnue, la ligne rattachee a sa fiche, et la fiche completee de ce que la
 * liste apportait. Sur le nom seul, c'etait confondre deux homonymes : la
 * « Awa Niang » d'un atelier de 2024, sans numero, recevait le numero de la
 * « Awa Niang » d'une formation de 2026, et les deux personnes n'en faisaient
 * plus qu'une. Et comme la base intervenait avant la liste, deux lignes d'une
 * meme liste pouvaient tomber sur deux fiches differentes de la base : le
 * doublon dans la liste n'etait alors meme plus vu.
 *
 * Desormais :
 *   1. les doublons de la liste sont cherches dans la liste seule
 *      (services/doublonsListe.js) ; l'ecran les montre et la personne qui
 *      importe decide, groupe par groupe, de ce qui est reuni ;
 *   2. chaque personne de la liste recoit sa propre fiche — rien n'est ecrit
 *      sur la fiche d'une autre liste ;
 *   3. seule exception : quelqu'un deja inscrit a CETTE activite (la meme
 *      liste importee deux fois, ou completee) n'est pas inscrit une seconde
 *      fois.
 *
 * Le rapprochement entre listes — la meme personne venue a trois formations —
 * reste possible, mais c'est un acte a part : Participants → fiches en
 * double, ou un administrateur le fait en le voyant, et peut le defaire.
 *
 * @param {boolean} [options.telleQuelle] n'applique aucune reunion entre
 *   lignes du fichier : une ligne, une inscription. Ce que l'import aurait
 *   reuni est rendu dans « rapprochementsEcartes » plutot que d'etre tu.
 * @param {Array<Array<number>>} [options.fusions] les ensembles de lignes (par
 *   position dans le fichier) que l'ecran a decide de reunir.
 */
async function importParticipantsRowsBatch(client, rows, activityId, options = {}) {
  const telleQuelle = options.telleQuelle === true;
  const { items, skippedMissingName, lignesIncompletes } = lireLignes(rows);
  const contactsIgnores = [];

  if (items.length === 0) {
    return {
      imported: 0, skippedMissingName, duplicatesInActivity: 0,
      contactsIgnores, rattachements: 0, champsCompletes: 0, lignesIncompletes,
      doublonsReunis: [], rapprochementsEcartes: [], fichesCreees: 0, personnesConnues: 0,
      doublons: { groupes: [], resume: { groupes: 0, certains: 0, probables: 0, a_verifier: 0 }, decide_par: "defaut" },
    };
  }

  /* 1. Les doublons de la liste, et ce qu'on en fait. */
  const analyse = analyserDoublons(items);
  const groupeDe = new Map(); // indice de ligne → groupe qui la contient
  for (const g of analyse.groupes) for (const k of g.lignes) if (!groupeDe.has(k)) groupeDe.set(k, g);

  const parPosition = new Map(items.map((it, k) => [it.ligne, k]));
  let fusions;
  let decidePar;
  if (telleQuelle) {
    fusions = [];
    decidePar = "telle_quelle";
  } else if (Array.isArray(options.fusions)) {
    fusions = options.fusions.map((e) => e.map((pos) => parPosition.get(pos)).filter((k) => k !== undefined));
    decidePar = "utilisateur";
  } else {
    fusions = analyse.groupes.filter((g) => g.defaut === "fusionner").map((g) => g.lignes);
    decidePar = "defaut";
  }
  const personnes = regrouper(items.length, fusions);

  /* En liste telle quelle : ce qu'on aurait reuni et qu'on laisse, consigne
     pour l'administrateur. */
  const rapprochementsEcartes = [];
  if (telleQuelle) {
    for (const g of analyse.groupes) {
      if (g.defaut !== "fusionner") continue;
      const [premier, ...autres] = g.lignes;
      for (const k of autres) {
        rapprochementsEcartes.push({
          indice: k, avecIndice: premier, motif: g.niveau,
          raison: g.raisons.join(", "),
          nom: items[k].nom, prenom: items[k].prenom,
          email: items[k].email || null, telephone: items[k].telephone || null,
          ligne_excel: items[k].ligneExcel, avec_ligne_excel: items[premier].ligneExcel,
          avec: nomAffiche(items[premier]),
        });
      }
    }
  }

  /* 2. Chaque personne du fichier : sa ligne la mieux renseignee (a egalite,
     la premiere), completee par les autres. Rien de ce qui est renseigne
     n'est ecrase ; une seconde adresse ou un second numero ne disparaissent
     pas sans un mot. */
  const renseignes = (it) => CHAMPS_LIGNE.filter((c) => it[c]).length;
  const doublonsReunis = [];
  const fiches = personnes.map((indices) => {
    const ordre = [...indices].sort((a, b) => renseignes(items[b]) - renseignes(items[a]) || a - b);
    const premier = items[ordre[0]];
    const donnees = {};
    for (const c of CHAMPS_LIGNE) donnees[c] = premier[c] || null;
    for (const k of ordre.slice(1)) {
      const it = items[k];
      for (const c of CHAMPS_LIGNE) if (!donnees[c] && it[c]) donnees[c] = it[c];
      if (it.email && donnees.email && normalizeEmail(it.email) !== normalizeEmail(donnees.email)) {
        contactsIgnores.push({
          nom: it.nom, prenom: it.prenom, champ: "email", valeur: it.email,
          motif: "adresse_differente", detenteur: nomAffiche(premier),
        });
      }
      if (it.telephone && donnees.telephone && telephonesDe(it.telephone).join() !== telephonesDe(donnees.telephone).join()) {
        contactsIgnores.push({
          nom: it.nom, prenom: it.prenom, champ: "telephone", valeur: it.telephone,
          motif: "telephone_different", detenteur: nomAffiche(premier),
        });
      }
      const g = groupeDe.get(k);
      doublonsReunis.push({
        nom: it.nom, prenom: it.prenom,
        email: it.email || null, telephone: it.telephone || null,
        ligne_excel: it.ligneExcel, avec_ligne_excel: premier.ligneExcel,
        avec: nomAffiche(premier),
        motif: g ? g.niveau : "choix",
        raison: g ? g.raisons.join(", ") : "réunies à la demande",
      });
    }
    return { indices, donnees, resolvedId: null, dejaInscrite: false };
  });

  /* 3. Deja inscrites a cette activite ?
     La meme liste importee deux fois ne doit pas inscrire deux fois les memes
     personnes. On compare a la seule liste de l'activite, avec les memes
     regles que dans le fichier ; une fiche deja inscrite ne sert qu'une fois
     — deux homonymes du fichier ne tombent pas sur la meme. */
  const { rows: inscrites } = await client.query(
    `SELECT p.id, p.nom, p.prenom, p.email, p.telephone, p.genre, p.age_range, p.statut, p.structure
       FROM activity_participants ap
       JOIN participants p ON p.id = ap.participant_id
      WHERE ap.activity_id = $1
      ORDER BY p.id`,
    [activityId]
  );
  const aCompleter = [];
  if (inscrites.length) {
    const prepInscrites = inscrites.map((f) => preparer({ ...f, normalizedGender: normalizeGender(f.genre), ageRange: f.age_range }));
    const prepFiches = fiches.map((f) => preparer(f.donnees));
    const collectifs = contactsCollectifs([...prepFiches, ...prepInscrites]);
    const index = new Map();
    const ranger = (cle, i) => { if (!index.has(cle)) index.set(cle, []); index.get(cle).push(i); };
    prepInscrites.forEach((p, i) => {
      for (const s of new Set(p.sons)) ranger(`s:${s}`, i);
      for (const t of p.tels) ranger(`t:${t}`, i);
      for (const m of p.mails) ranger(`m:${m}`, i);
    });
    const prises = new Set();
    const RANG = { certain: 0, probable: 1 };
    fiches.forEach((f, n) => {
      const p = prepFiches[n];
      const candidats = new Set();
      for (const s of new Set(p.sons)) for (const i of index.get(`s:${s}`) || []) candidats.add(i);
      for (const t of p.tels) for (const i of index.get(`t:${t}`) || []) candidats.add(i);
      for (const m of p.mails) for (const i of index.get(`m:${m}`) || []) candidats.add(i);
      let meilleur = null;
      for (const i of [...candidats].sort((a, b) => a - b)) {
        if (prises.has(i)) continue;
        const v = comparer(p, prepInscrites[i], collectifs);
        if (!v || !(v.niveau in RANG)) continue;
        if (!meilleur || RANG[v.niveau] < RANG[meilleur.v.niveau]) meilleur = { i, v };
      }
      if (!meilleur) return;
      prises.add(meilleur.i);
      const fiche = inscrites[meilleur.i];
      f.resolvedId = fiche.id;
      f.dejaInscrite = true;
      /* La liste completee apporte parfois ce que la premiere n'avait pas — les
         numeros, le genre. On le reporte sur la fiche de cette activite, sans
         rien ecraser, et seulement quand on est sur de la personne. */
      if (meilleur.v.niveau === "certain" || meilleur.v.nom === "identique") {
        const maj = {};
        const d = f.donnees;
        if (d.email && !fiche.email) maj.email = d.email;
        if (d.telephone && !fiche.telephone) maj.telephone = d.telephone;
        if (d.normalizedGender && !fiche.genre) maj.genre = d.normalizedGender;
        if (d.ageRange && !fiche.age_range) maj.age_range = d.ageRange;
        if (d.statut && !fiche.statut) maj.statut = d.statut;
        if (d.structure && !fiche.structure) maj.structure = d.structure;
        if (d.nom && !fiche.nom) maj.nom = d.nom;
        if (d.prenom && !fiche.prenom) maj.prenom = d.prenom;
        if (Object.keys(maj).length) aCompleter.push({ id: fiche.id, maj });
      }
    });
  }

  /* Les noms de colonnes viennent d'une liste fermee, ecrite ici : aucune
     donnee du fichier n'entre dans le texte de la requete. Les valeurs, elles,
     restent parametrees. NULLIF avant COALESCE : nom et prenom portent une
     chaine vide quand ils sont inconnus. */
  const COLONNES_AUTORISEES = new Set(["email", "telephone", "genre", "age_range", "statut", "structure", "nom", "prenom"]);
  let champsCompletes = 0;
  for (const { id, maj } of aCompleter) {
    const colonnes = Object.keys(maj).filter((c) => COLONNES_AUTORISEES.has(c));
    if (!colonnes.length) continue;
    const affectations = colonnes.map((c, i) => `${c} = COALESCE(NULLIF(${c}, ''), $${i + 2})`).join(", ");
    await client.query(`UPDATE participants SET ${affectations} WHERE id = $1`, [id, ...colonnes.map((c) => maj[c])]);
    champsCompletes += colonnes.length;
  }

  /* 4. Une fiche neuve par personne qui n'est pas deja inscrite. Les
     identifiants sont lus dans l'ordre d'insertion. */
  const aCreer = fiches.filter((f) => !f.resolvedId);
  if (aCreer.length > 0) {
    const col = (c, defaut = null) => aCreer.map((f) => f.donnees[c] || defaut);
    const { rows: crees } = await client.query(
      `INSERT INTO participants (nom, prenom, genre, age_range, email, telephone, statut, structure)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                            $5::text[], $6::text[], $7::text[], $8::text[])
       RETURNING id`,
      [
        col("nom", ""), col("prenom", ""), col("normalizedGender"), col("ageRange"),
        col("email"), col("telephone"), col("statut"), col("structure"),
      ]
    );
    if (crees.length !== aCreer.length) {
      throw new Error(`Import interrompu : ${aCreer.length} fiches a creer, ${crees.length} creees.`);
    }
    crees.forEach((r, j) => { aCreer[j].resolvedId = r.id; });
  }

  /* Le diagnostic de la liste telle quelle designe des fiches : « la fiche
     9840 et la fiche 9912 » se tranche, « deux Aissatou Diallo » non. */
  const ficheDeLigne = new Map();
  for (const f of fiches) for (const k of f.indices) ficheDeLigne.set(k, f.resolvedId);
  for (const r of rapprochementsEcartes) {
    r.fiche_id = ficheDeLigne.get(r.indice) ?? null;
    r.avec_fiche_id = ficheDeLigne.get(r.avecIndice) ?? null;
  }

  /* 5. Inscription a l'activite. */
  const ids = [...new Set(fiches.map((f) => f.resolvedId).filter(Boolean))];
  let imported = 0;
  if (ids.length > 0) {
    const lien = await client.query(
      `INSERT INTO activity_participants (activity_id, participant_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT DO NOTHING`,
      [activityId, ids]
    );
    imported = lien.rowCount;
  }

  return {
    imported,
    skippedMissingName,
    /* Personnes du fichier deja inscrites a cette activite. */
    duplicatesInActivity: fiches.filter((f) => f.dejaInscrite).length,
    contactsIgnores,
    /* L'import ne reconnait plus personne par son nom dans le reste de la
       base : plus aucun rattachement de ce genre. */
    rattachements: 0,
    champsCompletes,
    lignesIncompletes,
    doublonsReunis,
    rapprochementsEcartes,
    fichesCreees: aCreer.length,
    personnesConnues: fiches.filter((f) => f.dejaInscrite).length,
    doublons: {
      groupes: detaillerGroupes(analyse.groupes, items),
      resume: analyse.resume,
      decide_par: decidePar,
    },
  };
}


/* ===== CHAMPS DISPONIBLES POUR LE MAPPING MANUEL ===== */
const AVAILABLE_FIELDS = [
  { value: "nom",         label: "Nom" },
  { value: "prenom",      label: "Prénom" },
  { value: "nom_complet", label: "Nom complet" },
  { value: "genre",       label: "Genre / Sexe" },
  { value: "email",       label: "Email" },
  { value: "telephone",   label: "Téléphone" },
  { value: "structure",   label: "Structure / École" },
  { value: "tranche_age", label: "Tranche d'âge" },
  { value: "statut",      label: "Statut / Catégorie" },
];

/* ===== PREVIEW — analyse sans import ===== */
router.post("/preview", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rawRows.length === 0) return res.status(400).json({ error: "Fichier vide" });

    const headerIdx = findHeaderRowIndex(rawRows);
    const headerRow = rawRows[headerIdx].map(c => c != null ? String(c) : "");
    const dataRows = rawRows.slice(headerIdx + 1).filter(
      row => Array.isArray(row) && row.some(c => c != null && String(c).trim() !== "")
    );

    // Construire colonnes avec exemples de valeurs (3 premières lignes)
    const columns = headerRow
      .map((original, colIdx) => {
        if (!original.trim()) return null;
        const field = resolveField(original);
        const samples = dataRows.slice(0, 3)
          .map(r => r[colIdx] != null ? String(r[colIdx]).trim() : "")
          .filter(Boolean);
        return { original, field, samples };
      })
      .filter(Boolean);

    res.json({
      columns,
      total_rows: dataRows.length,
      header_row: headerIdx + 1,
      available_fields: AVAILABLE_FIELDS,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur analyse fichier" });
  } finally {
    safeUnlink(req.file?.path);
  }
});

/* ===== DOUBLONS DE LA LISTE — analyse sans import =====
 *
 * À la création d'une activité, il n'y a pas encore d'activité sur laquelle
 * rejouer l'import. Les doublons, eux, ne dépendent que du fichier : on les
 * cherche ici, sans rien écrire, pour que l'écran les montre et que la
 * personne qui importe décide de chacun avant de créer quoi que ce soit.
 */
router.post("/analyse-doublons", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });

    let manualMapping = {};
    try {
      manualMapping = req.body.manual_mapping ? JSON.parse(req.body.manual_mapping) : {};
    } catch {
      return res.status(400).json({ error: "Correspondance des colonnes illisible" });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const { rows } = parseRowsFromSheet(sheet, manualMapping);
    const { items } = lireLignes(rows);
    const analyse = analyserDoublons(items);

    res.json({
      total_lignes: rows.length,
      lignes_lues: items.length,
      groupes: detaillerGroupes(analyse.groupes, items),
      resume: analyse.resume,
    });
  } catch (err) {
    console.error("[ANALYSE DOUBLONS]", err);
    res.status(500).json({ error: "L'analyse des doublons a échoué." });
  } finally {
    safeUnlink(req.file?.path);
  }
});

/* ===== DOWNLOAD TEMPLATE XLSX ===== */
router.get("/template", authMiddleware, async (req, res) => {
  try {
    const buffer = await construireModeleListePresence();
    res.setHeader("Content-Disposition", 'attachment; filename="template_liste_presences.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error("[MODELE LISTE PRESENCE]", err);
    res.status(500).json({ error: "Le modèle n'a pas pu être généré." });
  }
});

/* ===== CRÉER ACTIVITÉ + IMPORTER PARTICIPANTS ===== */
router.post("/activity", authMiddleware, upload.single("file"), async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Acces refuse" });

    const { title, description, activity_date, duration_hours, location, device_id, partner_id, mode } = req.body;
    if (!title || !activity_date) return res.status(400).json({ error: "Titre et date requis" });
    if (!req.file) return res.status(400).json({ error: "Fichier Excel requis" });

    let resolvedPartnerId = partner_id || null;
    let resolvedDeviceId = device_id || null;
    let resolvedCoachId = null;
    if (req.user.role === "partner") {
      resolvedPartnerId = req.user.partner_id;
    } else if (req.user.role === "coach") {
      resolvedPartnerId = null;
      resolvedDeviceId = null;
      resolvedCoachId = req.user.id;
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const manualMapping = req.body.manual_mapping ? JSON.parse(req.body.manual_mapping) : {};
    const { rows, headerRowIndex, recognizedColumns, unrecognizedColumns } = parseRowsFromSheet(sheet, manualMapping);

    if (rows.length === 0) return res.status(400).json({ error: "Fichier Excel vide ou aucune donnée reconnue" });

    const telleQuelle = estTelleQuelle(req);

    await client.query("BEGIN");
    inTransaction = true;

    const resolvedMode = ["ligne", "presentiel"].includes(mode) ? mode : "presentiel";
    const activityResult = await client.query(
      `INSERT INTO activities (title, description, activity_date, duration_hours, location, device_id, partner_id, created_by, coach_id, mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, description || null, activity_date, duration_hours || null, location || null, resolvedDeviceId, resolvedPartnerId, req.user.id, resolvedCoachId, resolvedMode]
    );

    const activity = activityResult.rows[0];
    const stats = await importParticipantsRowsBatch(client, rows, activity.id, { telleQuelle, fusions: lireFusions(req) });

    if (telleQuelle) await consignerLeDoute(client, activity.id, stats.rapprochementsEcartes);

    await client.query("COMMIT");
    inTransaction = false;

    logAudit(req, "CREATE", "activities", activity.id, activity.title, {
      date: activity.activity_date,
      participants_importes: stats.imported,
      via: "import_excel",
    });
    await computeAndStoreReliability(activity.id).catch((e) => console.warn("Reliability:", e.message));

    res.status(201).json({
      message: "Import termine",
      activity,
      participants_importes: stats.imported,
      total_lignes: rows.length,
      /* Ce que l'import a vraiment produit : des personnes nouvelles, ou des
         lignes qui retombent sur des fiches deja la. */
      personnes_nouvelles: stats.fichesCreees,
      personnes_connues: stats.personnesConnues,
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
      /* Lesquelles, et pourquoi : un import qui ramene 18 lignes pour 20 doit
         pouvoir le justifier, sinon le doute porte sur tout le reste. */
      doublons_reunis: stats.doublonsReunis,
      /* Les groupes de doublons de la liste, avec ce qui en a ete fait. */
      doublons: stats.doublons,
      /* Le nom de famille recopie dans la case « Prenom » : on le dit ici
         plutot que de le laisser decouvrir au moment d'envoyer les
         attestations, ou il est deja trop tard pour le corriger en amont. */
      noms_repetes: repetitionsDans(rows.map((r) => parseParticipantFromMapped(r))).length,
      /* Les adresses que l'import n'a pas pu enregistrer, avec leur motif.
         Sans cette liste, la campagne partirait plus courte que la liste de
         presence sans que rien ne l'explique. */
      contacts_ignores: stats.contactsIgnores,
      fiches_completees: stats.rattachements,
      champs_completes: stats.champsCompletes,
      /* Importees quand meme, mais a completer : les rejeter biaisait les
         compteurs du centre. */
      lignes_incompletes: stats.lignesIncompletes,
      colonnes_reconnues: recognizedColumns,
      colonnes_non_reconnues: unrecognizedColumns,
      ligne_entete_detectee: headerRowIndex + 1,
    });
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Erreur import Excel" });
  } finally {
    client.release();
    safeUnlink(req.file?.path);
  }
});

/* ===== IMPORTER PARTICIPANTS SUR ACTIVITÉ (avec vérification souple) ===== */
/* ===== SIMULATION D'IMPORT =====
 *
 * « Le fichier a 36 lignes » ne dit pas ce qu'il va produire. Importe deux
 * fois dans la meme activite, il n'ajoute personne de plus mais cree des
 * fiches en double, et le nombre de beneficiaires grimpe sans qu'aucun
 * beneficiaire de plus ne soit venu. C'est arrive : trois listes empilees sur
 * une meme activite le meme jour, puis, un mois plus tard, un nettoyage qui a
 * retire des inscriptions sur le seul nom pour reparer — au risque de
 * confondre deux homonymes.
 *
 * On rejoue donc l'import reel — le meme code, pas une estimation — et on
 * annule tout. Le compte rendu est exact parce qu'il a vraiment eu lieu.
 */
const estSimulation = (req) =>
  req.body?.simulation === "1" || req.body?.simulation === "true" || req.body?.simulation === true;

/* « Garder la liste telle quelle » : une ligne, une inscription, aucun
   rapprochement entre lignes du fichier. C'est le responsable qui etait en
   salle qui le demande — il sait souvent ce qu'aucune regle ne peut deviner.
   Le doute n'est pas efface pour autant : il est consigne, et l'activite
   attend qu'un administrateur l'ait regarde. */
const estTelleQuelle = (req) =>
  req.body?.telle_quelle === "1" || req.body?.telle_quelle === "true" || req.body?.telle_quelle === true;

/* Consigne ce que l'import aurait reuni, et met l'activite sous reserve.
   Rien n'est ecrit quand il n'y a rien a trancher : une liste telle quelle
   sans le moindre doute est une liste ordinaire, et la faire valider pour
   rien userait la validation. */
async function consignerLeDoute(client, activityId, ecartes) {
  await client.query(
    `UPDATE activities
        SET liste_telle_quelle = TRUE, liste_validee_le = NULL,
            liste_validee_par = NULL, liste_validee_par_nom = NULL
      WHERE id = $1`,
    [activityId]
  );
  if (!ecartes.length) return 0;
  await client.query(
    `INSERT INTO rapprochements_ecartes
       (activity_id, fiche_id, avec_fiche_id, motif, nom, prenom, email, telephone, avec)
     SELECT $1, unnest($2::int[]), unnest($3::int[]), unnest($4::text[]),
            unnest($5::text[]), unnest($6::text[]), unnest($7::text[]),
            unnest($8::text[]), unnest($9::text[])`,
    [
      activityId,
      ecartes.map((r) => r.fiche_id ?? null),
      ecartes.map((r) => r.avec_fiche_id ?? null),
      ecartes.map((r) => r.motif),
      ecartes.map((r) => r.nom || null),
      ecartes.map((r) => r.prenom || null),
      ecartes.map((r) => r.email || null),
      ecartes.map((r) => r.telephone || null),
      ecartes.map((r) => r.avec || null),
    ]
  );
  return ecartes.length;
}

function compteRenduSimulation(activity, rows, stats, { recognizedColumns, unrecognizedColumns, headerRowIndex }) {
  return {
    simulation: true,
    activite: activity.title,
    date: activity.activity_date ?? null,
    total_lignes: rows.length,
    /* Les chiffres qui decident : ce qui s'ajoute vraiment, ce qui est deja
       la, et combien de personnes la base ne connaissait pas. */
    nouvelles_inscriptions: stats.imported,
    deja_inscrites: stats.duplicatesInActivity,
    personnes_nouvelles: stats.fichesCreees,
    personnes_connues: stats.personnesConnues,
    doublons_dans_le_fichier: stats.doublonsReunis.length,
    doublons_reunis: stats.doublonsReunis,
    /* Les groupes de doublons de la liste : l’écran les montre, et la
       personne qui importe décide de chacun avant d’écrire. */
    doublons: stats.doublons,
    /* En liste telle quelle : ce que l'import aurait reuni et qu'il laisse.
       C'est le prix a payer, et il doit etre affiche avant de cliquer, pas
       decouvert apres. */
    telle_quelle: stats.rapprochementsEcartes.length > 0 || undefined,
    rapprochements_ecartes: stats.rapprochementsEcartes,
    lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
    lignes_incompletes: stats.lignesIncompletes,
    contacts_ignores: stats.contactsIgnores,
    colonnes_reconnues: recognizedColumns,
    colonnes_non_reconnues: unrecognizedColumns,
    ligne_entete_detectee: headerRowIndex + 1,
  };
}

router.post("/participants/:activityId", authMiddleware, upload.single("file"), async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const { activityId } = req.params;
    if (!req.file) return res.status(400).json({ error: "Fichier Excel requis" });
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const activityResult = await client.query(
      "SELECT title, activity_date, partner_id, coach_id FROM activities WHERE id = $1",
      [activityId]
    );
    if (activityResult.rows.length === 0) return res.status(404).json({ error: "Activite introuvable" });

    const activity = activityResult.rows[0];
    if (req.user.role === "partner" && activity.partner_id !== req.user.partner_id)
      return res.status(403).json({ error: "Acces refuse" });
    if (req.user.role === "coach" && activity.coach_id !== req.user.id)
      return res.status(403).json({ error: "Acces refuse" });

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const manualMapping = req.body.manual_mapping ? JSON.parse(req.body.manual_mapping) : {};
    const { rows, headerRowIndex, recognizedColumns, unrecognizedColumns } = parseRowsFromSheet(sheet, manualMapping);

    if (rows.length === 0) return res.status(400).json({ error: "Fichier Excel vide ou aucune donnée reconnue" });

    const simulation = estSimulation(req);
    const telleQuelle = estTelleQuelle(req);

    await client.query("BEGIN");
    inTransaction = true;

    const stats = await importParticipantsRowsBatch(client, rows, activityId, { telleQuelle, fusions: lireFusions(req) });

    if (simulation) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.json(compteRenduSimulation(activity, rows, stats, {
        recognizedColumns, unrecognizedColumns, headerRowIndex,
      }));
    }

    if (telleQuelle) await consignerLeDoute(client, activityId, stats.rapprochementsEcartes);

    await client.query("COMMIT");
    inTransaction = false;

    logAudit(req, "UPDATE", "activities", activityId, activity.title, {
      action: "import_participants",
      participants_importes: stats.imported,
      /* Ce que l'import a vraiment fait, pas seulement combien de lignes il
         a lues : un compte qui monte doit pouvoir s'expliquer plus tard. */
      lignes_du_fichier: rows.length,
      deja_inscrites: stats.duplicatesInActivity,
      fiches_creees: stats.fichesCreees,
    });
    await computeAndStoreReliability(activityId).catch((e) => console.warn("Reliability:", e.message));

    res.json({
      message: "Import termine avec succes",
      activite: activity.title,
      date: activity.activity_date,
      participants_importes: stats.imported,
      total_lignes: rows.length,
      /* Ce que l'import a vraiment produit : des personnes nouvelles, ou des
         lignes qui retombent sur des fiches deja la. */
      personnes_nouvelles: stats.fichesCreees,
      personnes_connues: stats.personnesConnues,
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
      /* Lesquelles, et pourquoi : un import qui ramene 18 lignes pour 20 doit
         pouvoir le justifier, sinon le doute porte sur tout le reste. */
      doublons_reunis: stats.doublonsReunis,
      /* Les groupes de doublons de la liste, avec ce qui en a ete fait. */
      doublons: stats.doublons,
      noms_repetes: repetitionsDans(rows.map((r) => parseParticipantFromMapped(r))).length,
      /* Les adresses que l'import n'a pas pu enregistrer, avec leur motif.
         Sans cette liste, la campagne partirait plus courte que la liste de
         presence sans que rien ne l'explique. */
      contacts_ignores: stats.contactsIgnores,
      fiches_completees: stats.rattachements,
      champs_completes: stats.champsCompletes,
      /* Importees quand meme, mais a completer : les rejeter biaisait les
         compteurs du centre. */
      lignes_incompletes: stats.lignesIncompletes,
      colonnes_reconnues: recognizedColumns,
      colonnes_non_reconnues: unrecognizedColumns,
      ligne_entete_detectee: headerRowIndex + 1,
    });
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Erreur import Excel" });
  } finally {
    client.release();
    safeUnlink(req.file?.path);
  }
});

/* ===== IMPORT DIRECT SUR ACTIVITÉ EXISTANTE ===== */
router.post("/direct/:activityId", authMiddleware, upload.single("file"), async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    const { activityId } = req.params;
    if (!req.file) return res.status(400).json({ error: "Fichier Excel requis" });
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const activityResult = await client.query(
      "SELECT id, title, partner_id, coach_id FROM activities WHERE id = $1",
      [activityId]
    );
    if (!activityResult.rows.length) return res.status(404).json({ error: "Activite introuvable" });

    const activity = activityResult.rows[0];
    if (req.user.role === "partner" && activity.partner_id !== req.user.partner_id)
      return res.status(403).json({ error: "Acces refuse" });
    if (req.user.role === "coach" && activity.coach_id !== req.user.id)
      return res.status(403).json({ error: "Acces refuse" });

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const manualMapping = req.body.manual_mapping ? JSON.parse(req.body.manual_mapping) : {};
    const { rows, headerRowIndex, recognizedColumns, unrecognizedColumns } = parseRowsFromSheet(sheet, manualMapping);

    if (rows.length === 0) return res.status(400).json({ error: "Fichier Excel vide ou aucune donnée reconnue" });

    const simulation = estSimulation(req);
    const telleQuelle = estTelleQuelle(req);

    await client.query("BEGIN");
    inTransaction = true;

    const stats = await importParticipantsRowsBatch(client, rows, activityId, { telleQuelle, fusions: lireFusions(req) });

    if (simulation) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.json(compteRenduSimulation(activity, rows, stats, {
        recognizedColumns, unrecognizedColumns, headerRowIndex,
      }));
    }

    await client.query(
      "UPDATE activities SET participants_manual = NULL WHERE id = $1",
      [activityId]
    );

    if (telleQuelle) await consignerLeDoute(client, activityId, stats.rapprochementsEcartes);

    await client.query("COMMIT");
    inTransaction = false;

    logAudit(req, "UPDATE", "activities", activityId, activity.title, {
      action: "import_participants",
      participants_importes: stats.imported,
    });
    await computeAndStoreReliability(activityId).catch((e) => console.warn("Reliability:", e.message));

    res.json({
      message: "Import termine avec succes",
      activite: activity.title,
      participants_importes: stats.imported,
      total_lignes: rows.length,
      /* Ce que l'import a vraiment produit : des personnes nouvelles, ou des
         lignes qui retombent sur des fiches deja la. */
      personnes_nouvelles: stats.fichesCreees,
      personnes_connues: stats.personnesConnues,
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
      /* Lesquelles, et pourquoi : un import qui ramene 18 lignes pour 20 doit
         pouvoir le justifier, sinon le doute porte sur tout le reste. */
      doublons_reunis: stats.doublonsReunis,
      /* Les groupes de doublons de la liste, avec ce qui en a ete fait. */
      doublons: stats.doublons,
      noms_repetes: repetitionsDans(rows.map((r) => parseParticipantFromMapped(r))).length,
      /* Les adresses que l'import n'a pas pu enregistrer, avec leur motif.
         Sans cette liste, la campagne partirait plus courte que la liste de
         presence sans que rien ne l'explique. */
      contacts_ignores: stats.contactsIgnores,
      fiches_completees: stats.rattachements,
      champs_completes: stats.champsCompletes,
      /* Importees quand meme, mais a completer : les rejeter biaisait les
         compteurs du centre. */
      lignes_incompletes: stats.lignesIncompletes,
      colonnes_reconnues: recognizedColumns,
      colonnes_non_reconnues: unrecognizedColumns,
      ligne_entete_detectee: headerRowIndex + 1,
    });
  } catch (err) {
    if (inTransaction) await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Erreur import Excel" });
  } finally {
    client.release();
    safeUnlink(req.file?.path);
  }
});

module.exports = router;

/* Le rapprochement d'une ligne de fichier avec une personne deja connue est la
   partie delicate de l'import : c'est la que des adresses se perdaient. Elle
   est exposee ici pour etre eprouvee directement, sans passer par une requete
   HTTP et un fichier Excel. */
module.exports.__interne = {
  importParticipantsRowsBatch,
  lireLignes,
  parseRowsFromSheet,
  parseParticipantFromMapped,
};
