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
  repetitionsDans, normaliser, clePersonne, memePersonne,
} = require("../services/nomsDoublons");

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
      resolvedId: null,
    });
  }
  /* Ce que l'import n'a pas pu enregistrer. Une adresse perdue en silence est
     pire qu'une adresse refusee : la campagne part sans la personne et
     personne ne sait pourquoi. Tout ce qui est ecarte est donc rapporte. */
  const contactsIgnores = [];
  if (items.length === 0) {
    return {
      imported: 0, skippedMissingName, duplicatesInActivity: 0,
      contactsIgnores, rattachements: 0, champsCompletes: 0, lignesIncompletes,
    };
  }

  // 2. Qui est deja connu ? Une seule requete pour les adresses et les numeros.
  const emailSet = new Set(items.filter(it => it.email).map(it => it.email));
  const phoneSet = new Set(items.filter(it => it.telephone).map(it => it.telephone));
  const byEmail = new Map(); // email normalise → {id,nom,prenom,email,telephone}
  const byPhone = new Map(); // telephone → idem

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
      if (r.email) byEmail.set(normalizeEmail(r.email), r);
      if (r.telephone) byPhone.set(normalizePhone(r.telephone), r);
    }
  }

  /* 2b. Rapprochement par le nom.
     Les listes de presence ne portent pas toutes les memes colonnes : l'une a
     les adresses, l'autre les telephones, une troisieme ni l'un ni l'autre.
     Une personne connue par son numero qui revient sur une liste ne portant
     que son adresse n'etait rattachable par rien — l'import creait un second
     exemplaire d'elle-meme, et son information restait eparpillee entre deux
     fiches dont aucune n'etait complete.
     On rapproche donc sur le nom, sous deux reserves tenues plus bas : le nom
     ne doit designer qu'une seule fiche connue, et le fichier ne doit rien
     apporter qui contredise ce qui est deja enregistre. */
  const nomsCherches = [...new Set(items.map(it => normaliser(it.nom)).filter(Boolean))];
  const parNom = new Map(); // cle personne → fiche, ou null si le nom est ambigu
  if (nomsCherches.length > 0) {
    const { rows: connus } = await client.query(
      `SELECT id, nom, prenom, email, telephone, genre, age_range, statut, structure
         FROM participants WHERE lower(trim(nom)) = ANY($1)`,
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
  const toInsert = [];    // lignes qui donnent lieu a une nouvelle fiche
  const toInsertIdx = []; // leur indice dans items[]
  const aCompleter = [];  // fiches existantes auxquelles il manque un contact
  /* Qui detient chaque contact, en base comme dans le fichier en cours. Sans
     ce registre, deux lignes differentes portant la meme adresse etaient
     inserees l'une apres l'autre : la seconde tombait sur l'index d'unicite,
     ne s'inserait pas, et se voyait attribuer l'identifiant de la premiere.
     La seconde personne disparaissait purement et simplement, comptee comme
     un doublon. */
  const detenteurEmail = new Map();
  const detenteurTel = new Map();
  for (const [mail, fiche] of byEmail) detenteurEmail.set(mail, { cle: clePersonne(fiche.nom, fiche.prenom), fiche });
  for (const [tel, fiche] of byPhone) detenteurTel.set(tel, { cle: clePersonne(fiche.nom, fiche.prenom), fiche });

  const signaler = (it, champ, valeur, motif, detenteur) => {
    contactsIgnores.push({
      nom: it.nom, prenom: it.prenom, champ, valeur, motif,
      detenteur: detenteur ? `${detenteur.prenom || ""} ${detenteur.nom || ""}`.trim() : null,
    });
  };

  let rattachements = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let ex = it.email ? byEmail.get(it.email) : null;
    /* Retenu avant le repli sur le telephone : une adresse identifie a elle
       seule, un numero non. */
    const trouveParEmail = Boolean(ex);
    if (!ex && it.telephone) ex = byPhone.get(it.telephone);
    if (!ex && it.cle) {
      const candidat = parNom.get(it.cle);
      /* Ici le nom est seul — aucun contact ne corrobore. On s'en tient donc
         a la concordance stricte des mots, sans la tolerance au second
         prenom, qui confondrait « Fatou Sarr » et « Fatou Ndeye Sarr ». */
      if (candidat && riensOppose(candidat, it)) { ex = candidat; rattachements++; }
    }

    /* Le rapprochement exige que les mots du nom coincident exactement.
       Un prenom supplementaire fait deux personnes differentes, et non deux
       ecritures d'une meme : « Assietou Sy » et « Assietou Ndeye Sy » sont
       deux beneficiaires distinctes. La plateforme n'a pas a en decider.
       Seule exception : une ligne dont le nom est incomplet ne peut etre
       comparee par le nom, et son adresse la rattache seule. */
    if (ex && (memePersonne(ex, it) || (trouveParEmail && !it.cle))) {
      items[i].resolvedId = ex.id;
      /* La fiche existe mais il lui manque ce que le fichier apporte : c'est
         ce qui repare les adresses perdues par les imports precedents. */
      const emailAAjouter = it.email && !ex.email && !detenteurEmail.has(it.email) ? it.email : null;
      const telAAjouter = it.telephone && !ex.telephone && !detenteurTel.has(it.telephone) ? it.telephone : null;

      /* Tout ce que cette liste apporte et qui manque a la fiche. Une personne
         inscrite a trois formations voit ainsi sa fiche se completer au fil
         des listes, chacune apportant les colonnes que les autres n'avaient
         pas. Rien de deja renseigne n'est ecrase. */
      const maj = {};
      if (emailAAjouter) maj.email = emailAAjouter;
      if (telAAjouter) maj.telephone = telAAjouter;
      for (const [colonne, champ] of CHAMPS_COMPLETABLES) {
        if (!ex[colonne] && it[champ]) maj[colonne] = it[champ];
      }
      if (Object.keys(maj).length) {
        aCompleter.push({ id: ex.id, maj });
        /* La fiche en memoire suit la base : deux lignes du meme fichier
           portant la meme personne ne doivent pas compter deux fois le meme
           champ complete. */
        Object.assign(ex, maj);
      }
      if (it.email && !emailAAjouter && !ex.email) {
        signaler(it, "email", it.email, "deja_attribuee", detenteurEmail.get(it.email)?.fiche);
      } else if (it.email && ex.email && normalizeEmail(ex.email) !== it.email) {
        /* La personne est connue sous une autre adresse. On garde celle de la
           base — le fichier n'est pas forcement plus a jour — mais on le dit,
           faute de quoi la campagne partirait a l'ancienne adresse sans que
           rien ne l'indique. */
        signaler(it, "email", it.email, "adresse_differente", ex);
      }
      if (emailAAjouter) detenteurEmail.set(emailAAjouter, { cle: it.cle, fiche: ex });
      if (telAAjouter) detenteurTel.set(telAAjouter, { cle: it.cle, fiche: ex });
      if (ex.email) detenteurEmail.set(normalizeEmail(ex.email), { cle: clePersonne(ex.nom, ex.prenom), fiche: ex });
      continue;
    }

    // Nouvelle fiche : on ne lui attribue un contact que s'il est libre.
    let email = it.email;
    let telephone = it.telephone;
    if (email) {
      const detenteur = detenteurEmail.get(email);
      if (detenteur && detenteur.cle !== it.cle) {
        signaler(it, "email", email, detenteur.fiche ? "deja_attribuee" : "doublon_fichier", detenteur.fiche);
        email = null;
      }
    }
    if (telephone) {
      const detenteur = detenteurTel.get(telephone);
      if (detenteur && detenteur.cle !== it.cle) {
        signaler(it, "telephone", telephone, detenteur.fiche ? "deja_attribuee" : "doublon_fichier", detenteur.fiche);
        telephone = null;
      }
    }
    if (email && !detenteurEmail.has(email)) detenteurEmail.set(email, { cle: it.cle, fiche: null });
    if (telephone && !detenteurTel.has(telephone)) detenteurTel.set(telephone, { cle: it.cle, fiche: null });

    /* Apres retrait des contacts qui appartiennent a quelqu'un d'autre, il
       peut ne rien rester : une ligne sans nom dont l'adresse etait deja prise
       ne designe plus personne. L'inserer creerait une fiche vide, qui
       gonflerait les compteurs sans correspondre a personne — exactement ce
       qu'on cherche a eviter. Elle est deja rapportee plus haut. */
    if (!it.nom && !it.prenom && !email && !telephone) continue;

    toInsert.push({ ...it, email, telephone });
    toInsertIdx.push(i);
  }

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

  // 4a. Insertion groupee des fiches qui portent un contact
  const withContact = toInsert.map((p, j) => ({ p, j })).filter(({ p }) => p.email || p.telephone);
  if (withContact.length > 0) {
    await client.query(
      `INSERT INTO participants (nom, prenom, genre, age_range, email, telephone, statut, structure)
       SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::text[]), unnest($4::text[]),
              unnest($5::text[]), unnest($6::text[]), unnest($7::text[]), unnest($8::text[])
       ON CONFLICT DO NOTHING`,
      [
        withContact.map(({ p }) => p.nom),
        withContact.map(({ p }) => p.prenom),
        withContact.map(({ p }) => p.normalizedGender || null),
        withContact.map(({ p }) => p.ageRange || null),
        withContact.map(({ p }) => p.email || null),
        withContact.map(({ p }) => p.telephone || null),
        withContact.map(({ p }) => p.statut || null),
        withContact.map(({ p }) => p.structure || null),
      ]
    );

    // Relire pour recuperer les identifiants
    const newEmails = [...new Set(withContact.filter(({ p }) => p.email).map(({ p }) => p.email))];
    const newPhones = [...new Set(withContact.filter(({ p }) => p.telephone).map(({ p }) => p.telephone))];
    if (newEmails.length > 0 || newPhones.length > 0) {
      const parts2 = [], params2 = [];
      if (newEmails.length > 0) { params2.push(newEmails); parts2.push(`LOWER(email) = ANY($${params2.length})`); }
      if (newPhones.length > 0) { params2.push(newPhones); parts2.push(`telephone = ANY($${params2.length})`); }
      const { rows: refetched } = await client.query(
        `SELECT id, nom, prenom, email, telephone FROM participants WHERE ${parts2.join(' OR ')}`,
        params2
      );
      for (const r of refetched) {
        if (r.email) byEmail.set(normalizeEmail(r.email), r);
        if (r.telephone) byPhone.set(normalizePhone(r.telephone), r);
      }
    }
    /* On ne reprend un identifiant que si la fiche relue designe bien la meme
       personne : c'est le garde-fou contre l'echange d'identite decrit plus
       haut. Une insertion refusee laisse la ligne sans identifiant plutot que
       de la rattacher a quelqu'un d'autre. */
    for (const { p, j } of withContact) {
      let found = p.email ? byEmail.get(p.email) : null;
      if (!found && p.telephone) found = byPhone.get(p.telephone);
      /* Le controle par le nom est le garde-fou contre l'echange d'identite.
         Il ne s'applique pas aux lignes dont le nom est incomplet : leur cle
         est nulle, donc ne concorde avec rien, et exiger la concordance les
         faisait inserer une seconde fois — une fiche avec ses contacts, une
         autre sans. Pour celles-la, le contact suffit : l'etape precedente a
         deja retire tout contact appartenant a quelqu'un d'autre, celui qui
         reste est donc libre ou deja le sien. */
      const reconnue = found && (memePersonne(found, p) || !p.cle);
      if (reconnue) {
        items[toInsertIdx[j]].resolvedId = found.id;
      } else {
        const id = await insertParticipant(client, { ...p, email: null, telephone: null });
        if (id) items[toInsertIdx[j]].resolvedId = id;
        if (p.email) signaler(p, "email", p.email, "deja_attribuee", found || null);
      }
    }
  }

  // 4b. Fiches sans contact : insertion une par une
  const noContact = toInsert.map((p, j) => ({ p, j })).filter(({ p }) => !p.email && !p.telephone);
  for (const { p, j } of noContact) {
    const id = await insertParticipant(client, p);
    if (id) items[toInsertIdx[j]].resolvedId = id;
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
router.get("/template", authMiddleware, (req, res) => {
  const wb = xlsx.utils.book_new();
  const headers = ["Activite", "Date_activite", "Nom", "Prenom", "Genre", "Tranche_age", "Email", "Telephone", "Statut", "Structure"];
  const example = ["Nom de l activite", "2025-01-15", "Diallo", "Aminata", "F", "18-25", "aminata@example.com", "770000000", "Participant", "Universite Cheikh Anta Diop"];
  const ws = xlsx.utils.aoa_to_sheet([headers, example]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  xlsx.utils.book_append_sheet(wb, ws, "Liste de presences");
  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="template_liste_presences.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buffer);
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
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
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

    await client.query("BEGIN");
    inTransaction = true;

    const stats = await importParticipantsRowsBatch(client, rows, activityId);

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
      date: activity.activity_date,
      participants_importes: stats.imported,
      total_lignes: rows.length,
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
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

    await client.query("BEGIN");
    inTransaction = true;

    const stats = await importParticipantsRowsBatch(client, rows, activityId);

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
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
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
