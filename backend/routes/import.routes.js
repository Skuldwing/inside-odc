const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const { computeAndStoreReliability } = require("../services/reliability");

const {
  repetitionsDans, normaliser, compacterNom,
  clePersonne, cleApprochee, nomsCompatibles, memePersonne,
} = require("../services/nomsDoublons");
const { construireModeleListePresence } = require("../services/modeleListePresence");

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

  // Convertir les lignes de données en objets
  const dataRows = rawRows.slice(headerIdx + 1).filter(
    (row) => Array.isArray(row) && row.some((c) => c != null && String(c).trim() !== "")
  );

  const rows = dataRows.map((rawRow) => {
    const obj = {};
    colMapping.forEach(({ field }, idx) => {
      if (field) obj[field] = rawRow[idx] ?? null;
    });
    return obj;
  });

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

/* ===== FONCTIONS DB ===== */

async function insertParticipant(client, payload) {
  const { nom, prenom, normalizedGender, ageRange, email, telephone, statut, structure } = payload;
  const res = await client.query(
    `INSERT INTO participants (nom, prenom, genre, age_range, email, telephone, statut, structure)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT DO NOTHING RETURNING id`,
    [nom, prenom, normalizedGender, ageRange || null, email || null, telephone || null, statut || null, structure || null]
  );
  return res.rows[0]?.id || null;
}

async function importParticipantsRowsBatch(client, rows, activityId) {
  let skippedMissingName = 0;

  /* 1. Lecture de toutes les lignes.
     Une ligne n'est ecartee que si elle ne designe personne. L'import exigeait
     auparavant un nom ET un prenom : une feuille de presence ou quelqu'un
     n'avait ecrit que son nom de famille, ou dont la colonne « Nom complet »
     ne tenait qu'en un mot, perdait cette personne — sans que rien ne la
     remplace dans les compteurs. Des beneficiaires reels disparaissaient
     ainsi des statistiques du centre.
     On garde donc toute ligne portant de quoi designer quelqu'un : un nom, un
     prenom, une adresse ou un numero. Ce qui manque reste vide et se voit,
     plutot que de faire disparaitre la personne. */
  const items = [];
  const lignesIncompletes = [];
  for (const row of rows) {
    const p = parseParticipantFromMapped(row);
    if (!p.nom && !p.prenom && !p.email && !p.telephone) { skippedMissingName++; continue; }

    if (!p.nom || !p.prenom) {
      lignesIncompletes.push({
        nom: p.nom || null,
        prenom: p.prenom || null,
        email: p.email || null,
        telephone: p.telephone || null,
        manque: [!p.nom && "nom", !p.prenom && "prénom"].filter(Boolean),
      });
    }

    /* Les colonnes nom et prenom n'acceptent pas l'absence de valeur : une
       chaine vide dit « non renseigne » sans rien inventer. */
    const nom = p.nom || "";
    const prenom = p.prenom || "";
    items.push({
      ...p,
      nom,
      prenom,
      normalizedGender: normalizeGender(p.genre),
      cle: clePersonne(nom, prenom),
      /* La cle de repli, pour les lignes dont le nom est a moitie vide : elles
         n'avaient aucune cle, et deux fois la meme ligne donnait deux fiches. */
      approchee: cleApprochee(nom, prenom),
      resolvedId: null,
    });
  }

  /* Ce que l'import n'a pas pu enregistrer. Depuis que les contacts peuvent
     figurer sur plusieurs fiches, il n'ecarte plus d'adresse ni de numero :
     seule subsiste la mention d'une personne connue sous une autre adresse,
     qui n'est pas un rejet mais un avertissement. */
  const contactsIgnores = [];
  if (items.length === 0) {
    return {
      imported: 0, skippedMissingName, duplicatesInActivity: 0,
      contactsIgnores, rattachements: 0, champsCompletes: 0, lignesIncompletes,
      doublonsReunis: [],
    };
  }

  /* 2. Qui est deja connu ?
     Une adresse peut desormais figurer sur plusieurs fiches : la recherche
     rend donc une liste, et c'est le nom qui departage. */
  const emailSet = new Set(items.filter(it => it.email).map(it => it.email));
  const phoneSet = new Set(items.filter(it => it.telephone).map(it => it.telephone));
  const byEmail = new Map(); // email normalise → [fiches]
  const byPhone = new Map(); // telephone → [fiches]
  const ajouter = (carte, cle, fiche) => {
    if (!cle) return;
    if (!carte.has(cle)) carte.set(cle, []);
    if (!carte.get(cle).some((f) => f.id === fiche.id)) carte.get(cle).push(fiche);
  };

  if (emailSet.size > 0 || phoneSet.size > 0) {
    const parts = [], params = [];
    if (emailSet.size > 0) { params.push([...emailSet]); parts.push(`LOWER(email) = ANY($${params.length})`); }
    if (phoneSet.size > 0) { params.push([...phoneSet]); parts.push(`telephone = ANY($${params.length})`); }
    const { rows: existing } = await client.query(
      `SELECT id, nom, prenom, email, telephone, genre, age_range, statut, structure
         FROM participants WHERE ${parts.join(' OR ')}`,
      params
    );
    for (const r of existing) {
      ajouter(byEmail, normalizeEmail(r.email), r);
      ajouter(byPhone, normalizePhone(r.telephone), r);
    }
  }

  /* 2b. Rapprochement par le nom.
     Les listes de presence ne portent pas toutes les memes colonnes : l'une a
     les adresses, l'autre les telephones, une troisieme ni l'un ni l'autre.
     Une personne connue par son numero qui revient sur une liste ne portant
     que son adresse n'etait rattachable par rien — l'import creait un second
     exemplaire d'elle-meme, et son information restait eparpillee entre deux
     fiches dont aucune n'etait complete. */
  /* La recherche se fait sur la forme compacte du nom : sans accent, sans
     casse, sans apostrophe. Comparee a « lower(trim(nom)) », elle ne manquait
     pas seulement « N'Diaye » face a « Ndiaye » — elle manquait aussi
     « Ndiayé », puisque la valeur cherchee etait deja desaccentuee et celle de
     la base non. La fiche existante n'etait alors pas trouvee, et l'import en
     creait une seconde.

     Les deux colonnes sont interrogees avec l'ensemble des noms ET des prenoms
     du fichier : sur les feuilles de presence, « Nom » et « Prenom » sont
     remplies dans un sens ou dans l'autre selon qui tient la feuille. */
  const nomsCherches = [...new Set(
    items.flatMap((it) => [compacterNom(it.nom), compacterNom(it.prenom)]).filter(Boolean)
  )];
  const parNom = new Map(); // cle personne → fiche, ou null si le nom est ambigu
  if (nomsCherches.length > 0) {
    /* translate() desaccentue, regexp_replace() ote tout le reste — espaces,
       tirets, apostrophes. Les deux colonnes de la base passent par la meme
       transformation que compacterNom() applique au fichier. */
    const COMPACT = (colonne) => `regexp_replace(
      translate(lower(trim(${colonne})),
                'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
                'aaaaaaceeeeiiiinooooouuuuyy'),
      '[^a-z0-9]+', '', 'g')`;
    const { rows: connus } = await client.query(
      `SELECT id, nom, prenom, email, telephone, genre, age_range, statut, structure
         FROM participants
        WHERE ${COMPACT("nom")} = ANY($1) OR ${COMPACT("prenom")} = ANY($1)`,
      [nomsCherches]
    );
    for (const r of connus) {
      const cle = clePersonne(r.nom, r.prenom);
      /* Deux fiches sous le meme nom : on ne devine pas laquelle est la bonne,
         l'import creera une fiche plutot que de confondre deux homonymes. */
      if (!cle) continue;
      if (parNom.has(cle)) parNom.set(cle, null);
      else parNom.set(cle, r);
    }
  }

  /* Rapprocher par le seul nom deux fiches portant des identifiants
     differents reviendrait a confondre deux homonymes. On ne le fait que si
     rien ne les oppose : le fichier n'apporte pas une adresse ou un numero
     different de ceux deja enregistres. Une information absente d'un cote ne
     s'oppose a rien — c'est precisement le cas qu'on veut rattraper. */
  const riensOppose = (fiche, ligne) => {
    if (ligne.email && fiche.email && normalizeEmail(fiche.email) !== ligne.email) return false;
    if (ligne.telephone && fiche.telephone && normalizePhone(fiche.telephone) !== ligne.telephone) return false;
    return true;
  };

  /* Parmi les fiches qui portent ce contact, celle qui designe la meme
     personne. Le contact seul ne suffit plus a identifier quelqu'un : un
     numero de famille en designe plusieurs.
     A defaut d'une identite identique, une identite compatible : le meme
     contact et un nom qui dit la meme chose en plus court ou en plus long
     (« Awa Diop » et « Awa Marie Diop »). Si deux fiches s'y reconnaissent, on
     ne devine pas laquelle — l'import en creera une plutot que de confondre. */
  const memeNom = (fiches, it) => {
    const liste = fiches || [];
    const exact = liste.find((f) => memePersonne(f, it));
    if (exact) return exact;
    const compatibles = liste.filter((f) => nomsCompatibles(f, it));
    return compatibles.length === 1 ? compatibles[0] : null;
  };

  /* Ce que le fichier peut completer sur une fiche deja connue, au-dela des
     coordonnees. L'import les jetait : une liste apportant le genre et la
     structure d'une personne deja enregistree n'en gardait rien, et sa fiche
     restait incomplete pour toujours. */
  const CHAMPS_COMPLETABLES = [
    ["nom", "nom"],
    ["prenom", "prenom"],
    ["genre", "normalizedGender"],
    ["age_range", "ageRange"],
    ["statut", "statut"],
    ["structure", "structure"],
  ];

  // 3. Rapprochement ligne par ligne
  const aCompleter = [];  // fiches existantes auxquelles il manque quelque chose

  /* Ce qu'une ligne apporte a une autre qui designe la meme personne :
     seulement ce qui manque. Deux lignes d'un meme fichier peuvent porter
     l'une l'adresse, l'autre le numero — la fiche doit recevoir les deux. */
  const completerDepuis = (cible, source) => {
    const ajoutes = {};
    if (source.email && !cible.email) ajoutes.email = source.email;
    if (source.telephone && !cible.telephone) ajoutes.telephone = source.telephone;
    for (const [colonne, champ] of CHAMPS_COMPLETABLES) {
      if (!cible[champ] && source[champ]) ajoutes[colonne] = source[champ];
    }
    return ajoutes;
  };

  /* Deux lignes du meme fichier qui designent la meme personne ne doivent
     donner qu'une fiche. Le rapprochement se fait sur l'identite, non sur le
     contact : deux personnes differentes partageant une adresse restent deux
     personnes, et gardent chacune cette adresse.
     Trois lectures, de la plus sure a la plus prudente : la meme identite,
     puis le meme contact avec un nom compatible, puis — pour les lignes dont le
     nom est a moitie vide, qui n'ont donc pas d'identite — les memes mots sans
     rien qui les oppose. */
  const dejaVu = new Map();          // cle personne → indice dans items[]
  const parContactLigne = new Map(); // email ou telephone → [indices]
  const parApprochee = new Map();    // cle approchee → [indices]

  const noter = (carte, cle, i) => {
    if (!cle) return;
    if (!carte.has(cle)) carte.set(cle, []);
    carte.get(cle).push(i);
  };

  /* Ce qui separe deux lignes : toutes deux portent une adresse, ou toutes deux
     un numero, et ce n'est pas le meme. Une information absente ne contredit
     rien — c'est justement le cas qu'on veut rattraper. */
  const seContredisent = (a, b) =>
    Boolean(
      (a.email && b.email && a.email !== b.email) ||
      (a.telephone && b.telephone && a.telephone !== b.telephone)
    );

  const jumelleDe = (it) => {
    if (it.cle && dejaVu.has(it.cle)) {
      return { indice: dejaVu.get(it.cle), motif: "identite_identique" };
    }

    for (const contact of [it.email, it.telephone].filter(Boolean)) {
      for (const j of parContactLigne.get(contact) || []) {
        if (nomsCompatibles(items[j], it)) {
          return { indice: j, motif: "meme_contact" };
        }
      }
    }

    /* Deux lignes sans identite complete : « Diop » sans prenom, deux fois. Ni
       l'une ni l'autre ne porte de quoi les distinguer — pas d'adresse
       differente, pas de numero different. Les compter deux fois gonflerait
       l'effectif de l'activite d'une personne qui n'existe pas. */
    if (!it.cle && it.approchee) {
      for (const j of parApprochee.get(it.approchee) || []) {
        if (!items[j].cle && !seContredisent(items[j], it)) {
          return { indice: j, motif: "identite_incomplete" };
        }
      }
    }
    return null;
  };

  /* Ce que cette ligne apporte pour reconnaitre les suivantes. */
  const enregistrer = (i) => {
    const it = items[i];
    if (it.cle && !dejaVu.has(it.cle)) dejaVu.set(it.cle, i);
    noter(parContactLigne, it.email, i);
    noter(parContactLigne, it.telephone, i);
    noter(parApprochee, it.approchee, i);
  };

  /* Les lignes reunies, avec le motif : un import qui ramene 18 lignes pour 20
     doit pouvoir dire lesquelles, et pourquoi. */
  const doublonsReunis = [];

  const signaler = (it, champ, valeur, motif, detenteur) => {
    contactsIgnores.push({
      nom: it.nom, prenom: it.prenom, champ, valeur, motif,
      detenteur: detenteur ? `${detenteur.prenom || ""} ${detenteur.nom || ""}`.trim() : null,
    });
  };

  let rattachements = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    let ex = it.email ? memeNom(byEmail.get(it.email), it) : null;
    if (!ex && it.telephone) ex = memeNom(byPhone.get(it.telephone), it);

    /* Une ligne dont le nom est incomplet ne peut etre comparee par le nom.
       Son adresse la rattache alors seule — c'est le seul moyen de ne pas en
       faire une seconde fiche anonyme. */
    if (!ex && !it.cle && it.email) {
      const candidats = byEmail.get(it.email) || [];
      if (candidats.length === 1) ex = candidats[0];
    }

    if (!ex && it.cle) {
      const candidat = parNom.get(it.cle);
      if (candidat && riensOppose(candidat, it)) { ex = candidat; rattachements++; }
    }

    if (ex) {
      items[i].resolvedId = ex.id;

      /* Tout ce que cette liste apporte et qui manque a la fiche. Une personne
         inscrite a trois formations voit ainsi sa fiche se completer au fil
         des listes, chacune apportant les colonnes que les autres n'avaient
         pas. Rien de deja renseigne n'est ecrase. */
      const maj = {};
      if (it.email && !ex.email) maj.email = it.email;
      if (it.telephone && !ex.telephone) maj.telephone = it.telephone;
      for (const [colonne, champ] of CHAMPS_COMPLETABLES) {
        if (!ex[colonne] && it[champ]) maj[colonne] = it[champ];
      }
      if (Object.keys(maj).length) {
        aCompleter.push({ id: ex.id, maj });
        /* La fiche en memoire suit la base : deux lignes du meme fichier
           portant la meme personne ne doivent pas compter deux fois le meme
           champ complete. */
        Object.assign(ex, maj);
        if (maj.email) ajouter(byEmail, maj.email, ex);
        if (maj.telephone) ajouter(byPhone, maj.telephone, ex);
      }

      /* La personne est connue sous une autre adresse. On garde celle de la
         base — le fichier n'est pas forcement plus a jour — mais on le dit,
         faute de quoi la campagne partirait a l'ancienne adresse sans que
         rien ne l'indique. */
      if (it.email && ex.email && normalizeEmail(ex.email) !== it.email) {
        signaler(it, "email", it.email, "adresse_differente", ex);
      }

      enregistrer(i);
      continue;
    }

    /* Deja rencontree plus haut dans ce meme fichier : une seule fiche, qui
       recoit ce que cette ligne-ci apporte en plus. */
    const jumelle = jumelleDe(it);
    if (jumelle) {
      const premier = items[jumelle.indice];
      const ajoutes = completerDepuis(premier, it);
      for (const [colonne, valeur] of Object.entries(ajoutes)) {
        const champ = CHAMPS_COMPLETABLES.find(([c]) => c === colonne)?.[1] || colonne;
        premier[champ] = valeur;
        if (colonne === "email" || colonne === "telephone") premier[colonne] = valeur;
      }
      /* Si la premiere occurrence designait une fiche deja en base, ce
         supplement doit y etre ecrit ; sinon il partira avec l'insertion. */
      if (premier.resolvedId && Object.keys(ajoutes).length) {
        aCompleter.push({ id: premier.resolvedId, maj: ajoutes });
      }
      items[i].memeQue = jumelle.indice;
      /* La ligne reunie portait une autre adresse. C'est la premiere qui est
         conservee — le fichier ne dit pas laquelle est la bonne — mais la
         seconde ne doit pas disparaitre sans un mot : c'est peut-etre celle a
         laquelle la personne attend son attestation. */
      if (it.email && premier.email && it.email !== premier.email) {
        signaler(it, "email", it.email, "adresse_differente", premier);
      }
      doublonsReunis.push({
        nom: it.nom, prenom: it.prenom,
        email: it.email || null, telephone: it.telephone || null,
        motif: jumelle.motif,
        avec: `${premier.prenom || ""} ${premier.nom || ""}`.trim(),
      });
      enregistrer(i);
      continue;
    }

    enregistrer(i);
    items[i].aInserer = true;
  }

  /* Les fiches a creer sont relevees apres la boucle : une ligne repetee plus
     bas a pu completer la premiere entre-temps. */
  const toInsert = [];
  const toInsertIdx = [];
  items.forEach((it, i) => {
    if (it.aInserer) { toInsert.push(it); toInsertIdx.push(i); }
  });

  /* 3b. Completer les fiches deja connues avec ce que la liste apporte.
     Les noms de colonnes viennent de CHAMPS_COMPLETABLES et des deux champs de
     contact — une liste fermee, ecrite ici : aucune donnee du fichier n'entre
     dans le texte de la requete. Les valeurs, elles, restent parametrees. */
  const COLONNES_AUTORISEES = new Set([
    "email", "telephone", ...CHAMPS_COMPLETABLES.map(([c]) => c),
  ]);
  let champsCompletes = 0;
  for (const { id, maj } of aCompleter) {
    const colonnes = Object.keys(maj).filter((c) => COLONNES_AUTORISEES.has(c));
    if (!colonnes.length) continue;
    /* NULLIF avant COALESCE : nom et prenom n'acceptent pas l'absence de
       valeur et portent une chaine vide quand ils sont inconnus — sans cela
       une fiche sans nom ne pourrait jamais en recevoir un. */
    const affectations = colonnes
      .map((c, i) => `${c} = COALESCE(NULLIF(${c}, ''), $${i + 2})`)
      .join(", ");
    await client.query(
      `UPDATE participants SET ${affectations} WHERE id = $1`,
      [id, ...colonnes.map((c) => maj[c])]
    );
    champsCompletes += colonnes.length;
  }

  /* 4. Creation des nouvelles fiches.
     Plus rien ne peut echouer sur un index d'unicite : chaque ligne donne une
     fiche, avec les coordonnees que la liste porte. On lit les identifiants
     rendus dans l'ordre d'insertion plutot que de relire la table — avec des
     contacts partages, une relecture par adresse serait ambigue. */
  if (toInsert.length > 0) {
    const { rows: crees } = await client.query(
      `INSERT INTO participants (nom, prenom, genre, age_range, email, telephone, statut, structure)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                            $5::text[], $6::text[], $7::text[], $8::text[])
       RETURNING id`,
      [
        toInsert.map((p) => p.nom),
        toInsert.map((p) => p.prenom),
        toInsert.map((p) => p.normalizedGender || null),
        toInsert.map((p) => p.ageRange || null),
        toInsert.map((p) => p.email || null),
        toInsert.map((p) => p.telephone || null),
        toInsert.map((p) => p.statut || null),
        toInsert.map((p) => p.structure || null),
      ]
    );
    if (crees.length !== toInsert.length) {
      throw new Error(
        `Import interrompu : ${toInsert.length} fiches a creer, ${crees.length} creees.`
      );
    }
    crees.forEach((r, j) => {
      items[toInsertIdx[j]].resolvedId = r.id;
      /* Marquee comme nouvelle : la simulation doit pouvoir dire combien de
         personnes la base ne connaissait pas. */
      items[toInsertIdx[j]].creee = true;
    });
  }

  /* Les lignes repetees dans le fichier reprennent l'identifiant de la
     premiere occurrence, une fois celle-ci resolue. */
  for (const it of items) {
    if (it.resolvedId == null && it.memeQue != null) {
      it.resolvedId = items[it.memeQue].resolvedId;
    }
  }

  // 5. Rattachement a l'activite
  const validIds = [...new Set(items.filter(it => it.resolvedId).map(it => it.resolvedId))];
  let imported = 0, duplicatesInActivity = 0;
  if (validIds.length > 0) {
    const linkRes = await client.query(
      `INSERT INTO activity_participants (activity_id, participant_id)
       SELECT unnest($1::int[]), unnest($2::int[])
       ON CONFLICT DO NOTHING`,
      [validIds.map(() => activityId), validIds]
    );
    imported = linkRes.rowCount;
    duplicatesInActivity = items.filter(it => it.resolvedId).length - imported;
  }

  return {
    imported, skippedMissingName, duplicatesInActivity,
    contactsIgnores, rattachements, champsCompletes, lignesIncompletes,
    doublonsReunis,
    /* De quoi dire, avant d'ecrire, ce que le fichier va reellement produire :
       des personnes que la base ne connaissait pas, ou des lignes qui
       retombent sur des fiches deja la. C'est la difference entre une liste
       nouvelle et une liste deja importee. */
    fichesCreees: toInsert.length,
    personnesConnues: items.filter((it) => it.resolvedId && !it.creee).length,
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

    await client.query("BEGIN");
    inTransaction = true;

    const resolvedMode = ["ligne", "presentiel"].includes(mode) ? mode : "presentiel";
    const activityResult = await client.query(
      `INSERT INTO activities (title, description, activity_date, duration_hours, location, device_id, partner_id, created_by, coach_id, mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, description || null, activity_date, duration_hours || null, location || null, resolvedDeviceId, resolvedPartnerId, req.user.id, resolvedCoachId, resolvedMode]
    );

    const activity = activityResult.rows[0];
    const stats = await importParticipantsRowsBatch(client, rows, activity.id);

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

    await client.query("BEGIN");
    inTransaction = true;

    const stats = await importParticipantsRowsBatch(client, rows, activityId);

    if (simulation) {
      await client.query("ROLLBACK");
      inTransaction = false;
      return res.json(compteRenduSimulation(activity, rows, stats, {
        recognizedColumns, unrecognizedColumns, headerRowIndex,
      }));
    }

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

    await client.query("BEGIN");
    inTransaction = true;

    const stats = await importParticipantsRowsBatch(client, rows, activityId);

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
  parseRowsFromSheet,
  parseParticipantFromMapped,
};
