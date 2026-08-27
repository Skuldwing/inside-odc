const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const { computeAndStoreReliability } = require("../services/reliability");

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

function normalizeIdentity(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function samePersonByName(existing, nom, prenom) {
  return (
    normalizeIdentity(existing?.nom) === normalizeIdentity(nom) &&
    normalizeIdentity(existing?.prenom) === normalizeIdentity(prenom)
  );
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
    email: clean(obj.email),
    telephone: clean(obj.telephone),
    statut: clean(obj.statut),
    structure: clean(obj.structure),
    ageRange: clean(obj.tranche_age),
  };
}

/* ===== FONCTIONS DB (inchangées) ===== */

async function findParticipantByEmail(client, email) {
  const res = await client.query(
    "SELECT id, nom, prenom FROM participants WHERE email = $1 LIMIT 1",
    [email]
  );
  return res.rows[0] || null;
}

async function findParticipantByPhoneAndName(client, telephone, nom, prenom) {
  const res = await client.query(
    `SELECT id FROM participants
     WHERE telephone = $1 AND lower(nom) = lower($2) AND lower(prenom) = lower($3)
     LIMIT 1`,
    [telephone, String(nom), String(prenom)]
  );
  return res.rows[0]?.id || null;
}

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

async function updateParticipantIfMissingData(client, participantId, payload) {
  const { nom, prenom, normalizedGender, ageRange, email, telephone, statut, structure } = payload;
  await client.query(
    `UPDATE participants SET
       nom       = COALESCE(nom, $1),
       prenom    = COALESCE(prenom, $2),
       genre     = COALESCE(genre, $3),
       age_range = COALESCE(age_range, $4),
       email = CASE
         WHEN $5::text IS NULL THEN email
         WHEN email IS NOT NULL THEN email
         WHEN EXISTS (SELECT 1 FROM participants p2 WHERE p2.email = $5::text AND p2.id <> $9) THEN email
         ELSE $5::text END,
       telephone = CASE
         WHEN $6::text IS NULL THEN telephone
         WHEN telephone IS NOT NULL THEN telephone
         WHEN EXISTS (SELECT 1 FROM participants p2 WHERE p2.telephone = $6::text AND p2.id <> $9) THEN telephone
         ELSE $6::text END,
       statut    = COALESCE(statut, $7),
       structure = COALESCE(structure, $8)
     WHERE id = $9`,
    [nom, prenom, normalizedGender, ageRange || null, email || null, telephone || null, statut || null, structure || null, participantId]
  );
}

async function resolveParticipantId(client, payload) {
  const { nom, prenom, email, telephone } = payload;
  let participantId = null;

  if (email) {
    const existing = await findParticipantByEmail(client, email);
    participantId = existing && samePersonByName(existing, nom, prenom) ? existing.id : null;
  } else if (telephone) {
    participantId = await findParticipantByPhoneAndName(client, telephone, nom, prenom);
  }

  if (participantId) {
    await updateParticipantIfMissingData(client, participantId, payload);
    return participantId;
  }

  participantId = await insertParticipant(client, payload);
  if (participantId) return participantId;

  if (email) {
    const existing = await findParticipantByEmail(client, email);
    participantId = existing && samePersonByName(existing, nom, prenom) ? existing.id : null;
    if (participantId) return participantId;
  }
  if (telephone) {
    participantId = await findParticipantByPhoneAndName(client, telephone, nom, prenom);
    if (participantId) return participantId;
  }
  if (email) {
    participantId = await insertParticipant(client, { ...payload, email: null });
    if (participantId) return participantId;
  }
  if (telephone) {
    participantId = await insertParticipant(client, { ...payload, telephone: null });
    if (participantId) return participantId;
  }
  if (email || telephone) {
    participantId = await insertParticipant(client, { ...payload, email: null, telephone: null });
  }
  return participantId;
}

async function importParticipantsRowsBatch(client, rows, activityId) {
  let skippedMissingName = 0;

  // 1. Parse all rows upfront
  const items = [];
  for (const row of rows) {
    const p = parseParticipantFromMapped(row);
    if (!p.nom || !p.prenom) { skippedMissingName++; continue; }
    items.push({ ...p, normalizedGender: normalizeGender(p.genre), resolvedId: null });
  }
  if (items.length === 0) return { imported: 0, skippedMissingName, duplicatesInActivity: 0 };

  // 2. Batch-fetch existing participants by email/phone (1 query)
  const emailSet = new Set(items.filter(it => it.email).map(it => it.email.trim().toLowerCase()));
  const phoneSet = new Set(items.filter(it => it.telephone).map(it => it.telephone.trim()));
  const byEmail = new Map(); // lowercase email → {id,nom,prenom}
  const byPhone = new Map(); // phone → {id,nom,prenom}

  if (emailSet.size > 0 || phoneSet.size > 0) {
    const parts = [], params = [];
    if (emailSet.size > 0) { params.push([...emailSet]); parts.push(`LOWER(email) = ANY($${params.length})`); }
    if (phoneSet.size > 0) { params.push([...phoneSet]); parts.push(`telephone = ANY($${params.length})`); }
    const { rows: existing } = await client.query(
      `SELECT id, nom, prenom, email, telephone FROM participants WHERE ${parts.join(' OR ')}`,
      params
    );
    for (const r of existing) {
      if (r.email) byEmail.set(r.email.trim().toLowerCase(), r);
      if (r.telephone) byPhone.set(r.telephone.trim(), r);
    }
  }

  // 3. Classify: already exists vs. needs insert
  const toInsert = [];   // items needing a new participant row
  const toInsertIdx = []; // their index in items[]

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    let ex = it.email ? byEmail.get(it.email.trim().toLowerCase()) : null;
    if (!ex && it.telephone) ex = byPhone.get(it.telephone.trim());

    if (ex && samePersonByName(ex, it.nom, it.prenom)) {
      items[i].resolvedId = ex.id;
    } else {
      // Drop any contact field that belongs to a different person to avoid conflict
      let email = it.email;
      let telephone = it.telephone;
      if (email) {
        const clash = byEmail.get(email.trim().toLowerCase());
        if (clash && !samePersonByName(clash, it.nom, it.prenom)) email = null;
      }
      if (telephone) {
        const clash = byPhone.get(telephone.trim());
        if (clash && !samePersonByName(clash, it.nom, it.prenom)) telephone = null;
      }
      toInsert.push({ ...it, email, telephone });
      toInsertIdx.push(i);
    }
  }

  // 4a. Bulk INSERT participants that have email or phone (1 unnest query)
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

    // Re-fetch to get IDs (both newly inserted + conflicted rows already existed) (1 query)
    const newEmails = [...new Set(withContact.filter(({ p }) => p.email).map(({ p }) => p.email.trim().toLowerCase()))];
    const newPhones = [...new Set(withContact.filter(({ p }) => p.telephone).map(({ p }) => p.telephone.trim()))];
    if (newEmails.length > 0 || newPhones.length > 0) {
      const parts2 = [], params2 = [];
      if (newEmails.length > 0) { params2.push(newEmails); parts2.push(`LOWER(email) = ANY($${params2.length})`); }
      if (newPhones.length > 0) { params2.push(newPhones); parts2.push(`telephone = ANY($${params2.length})`); }
      const { rows: refetched } = await client.query(
        `SELECT id, email, telephone FROM participants WHERE ${parts2.join(' OR ')}`,
        params2
      );
      for (const r of refetched) {
        if (r.email) byEmail.set(r.email.trim().toLowerCase(), r);
        if (r.telephone) byPhone.set(r.telephone.trim(), r);
      }
    }
    // Map IDs back to items
    for (const { p, j } of withContact) {
      let found = p.email ? byEmail.get(p.email.trim().toLowerCase()) : null;
      if (!found && p.telephone) found = byPhone.get(p.telephone.trim());
      if (found) items[toInsertIdx[j]].resolvedId = found.id;
    }
  }

  // 4b. Name-only participants: individual inserts (no unique key, rare)
  const noContact = toInsert.map((p, j) => ({ p, j })).filter(({ p }) => !p.email && !p.telephone);
  for (const { p, j } of noContact) {
    const id = await insertParticipant(client, p);
    if (id) items[toInsertIdx[j]].resolvedId = id;
  }

  // 5. Bulk INSERT activity_participants (1 unnest query)
  const validIds = items.filter(it => it.resolvedId).map(it => it.resolvedId);
  let imported = 0, duplicatesInActivity = 0;
  if (validIds.length > 0) {
    const linkRes = await client.query(
      `INSERT INTO activity_participants (activity_id, participant_id)
       SELECT unnest($1::int[]), unnest($2::int[])
       ON CONFLICT DO NOTHING`,
      [validIds.map(() => activityId), validIds]
    );
    imported = linkRes.rowCount;
    duplicatesInActivity = validIds.length - imported;
  }

  return { imported, skippedMissingName, duplicatesInActivity };
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
    computeAndStoreReliability(activity.id).catch((e) => console.warn("Reliability:", e.message));

    res.status(201).json({
      message: "Import termine",
      activity,
      participants_importes: stats.imported,
      total_lignes: rows.length,
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
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
    computeAndStoreReliability(activityId).catch((e) => console.warn("Reliability:", e.message));

    res.json({
      message: "Import termine avec succes",
      activite: activity.title,
      date: activity.activity_date,
      participants_importes: stats.imported,
      total_lignes: rows.length,
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
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
    computeAndStoreReliability(activityId).catch((e) => console.warn("Reliability:", e.message));

    res.json({
      message: "Import termine avec succes",
      activite: activity.title,
      participants_importes: stats.imported,
      total_lignes: rows.length,
      lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
      doublons_dans_activite: stats.duplicatesInActivity,
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
