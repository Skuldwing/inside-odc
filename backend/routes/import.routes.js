const express = require("express");
const multer = require("multer");
const xlsx = require("xlsx");
const fs = require("fs");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

/* ===== UPLOAD CONFIG ===== */
const uploadDir = process.env.UPLOAD_DIR || "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: `${uploadDir}/`,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function safeUnlink(path) {
  if (!path) return;
  fs.unlink(path, () => {});
}

function normalizeGender(value) {
  if (!value) return null;
  const v = String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["m", "h", "homme", "male", "masculin"].includes(v)) return "H";
  if (["f", "femme", "female", "feminin"].includes(v)) return "F";
  return null;
}

function normalizeKey(key) {
  if (!key) return "";
  return String(key)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['"]/g, "")
    .replace(/\s+/g, "_");
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) {
    out[normalizeKey(key)] = value;
  }
  return out;
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

function parseParticipantRow(row) {
  const normalized = normalizeRow(row);
  return {
    nom: normalized.nom || normalized.last_name || null,
    prenom: normalized.prenom || normalized.first_name || null,
    genre: normalized.genre || normalized.gender || null,
    email: normalized.email || null,
    telephone: normalized.telephone || normalized.phone || null,
    statut: normalized.statut || normalized.status || null,
    structure: normalized.structure || null,
    ageRange:
      normalized.tranche_age ||
      normalized.tranche_dage ||
      normalized.tranche_age_ ||
      normalized.age_range ||
      null,
  };
}

async function findParticipantByEmail(client, email) {
  const existingByEmail = await client.query(
    `
    SELECT id, nom, prenom
    FROM participants
    WHERE email = $1
    LIMIT 1
    `,
    [email]
  );
  return existingByEmail.rows[0] || null;
}

async function findParticipantByPhoneAndName(client, telephone, nom, prenom) {
  const existingByPhoneAndName = await client.query(
    `
    SELECT id
    FROM participants
    WHERE telephone = $1
      AND lower(nom) = lower($2)
      AND lower(prenom) = lower($3)
    LIMIT 1
    `,
    [telephone, String(nom), String(prenom)]
  );
  return existingByPhoneAndName.rows[0]?.id || null;
}

async function insertParticipant(client, payload) {
  const {
    nom,
    prenom,
    normalizedGender,
    ageRange,
    email,
    telephone,
    statut,
    structure,
  } = payload;

  const insertResult = await client.query(
    `
    INSERT INTO participants
    (nom, prenom, genre, age_range, email, telephone, statut, structure)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT DO NOTHING
    RETURNING id
    `,
    [
      nom,
      prenom,
      normalizedGender,
      ageRange || null,
      email || null,
      telephone || null,
      statut || null,
      structure || null,
    ]
  );
  return insertResult.rows[0]?.id || null;
}

async function updateParticipantIfMissingData(client, participantId, payload) {
  const {
    nom,
    prenom,
    normalizedGender,
    ageRange,
    email,
    telephone,
    statut,
    structure,
  } = payload;

  await client.query(
    `
    UPDATE participants
    SET
      nom = COALESCE(nom, $1),
      prenom = COALESCE(prenom, $2),
      genre = COALESCE(genre, $3),
      age_range = COALESCE(age_range, $4),
      email = CASE
        WHEN $5::text IS NULL THEN email
        WHEN email IS NOT NULL THEN email
        WHEN EXISTS (
          SELECT 1 FROM participants p2 WHERE p2.email = $5::text AND p2.id <> $9
        ) THEN email
        ELSE $5::text
      END,
      telephone = CASE
        WHEN $6::text IS NULL THEN telephone
        WHEN telephone IS NOT NULL THEN telephone
        WHEN EXISTS (
          SELECT 1 FROM participants p2 WHERE p2.telephone = $6::text AND p2.id <> $9
        ) THEN telephone
        ELSE $6::text
      END,
      statut = COALESCE(statut, $7),
      structure = COALESCE(structure, $8)
    WHERE id = $9
    `,
    [
      nom,
      prenom,
      normalizedGender,
      ageRange || null,
      email || null,
      telephone || null,
      statut || null,
      structure || null,
      participantId,
    ]
  );
}

async function resolveParticipantId(client, payload) {
  const { nom, prenom, email, telephone } = payload;

  let participantId = null;

  if (email) {
    const existing = await findParticipantByEmail(client, email);
    participantId = existing && samePersonByName(existing, nom, prenom)
      ? existing.id
      : null;
  } else if (telephone) {
    participantId = await findParticipantByPhoneAndName(
      client,
      telephone,
      nom,
      prenom
    );
  }

  if (participantId) {
    await updateParticipantIfMissingData(client, participantId, payload);
    return participantId;
  }

  participantId = await insertParticipant(client, payload);
  if (participantId) return participantId;

  if (email) {
    const existingAfterConflict = await findParticipantByEmail(client, email);
    participantId =
      existingAfterConflict && samePersonByName(existingAfterConflict, nom, prenom)
        ? existingAfterConflict.id
        : null;
    if (participantId) return participantId;
  }

  if (telephone) {
    participantId = await findParticipantByPhoneAndName(
      client,
      telephone,
      nom,
      prenom
    );
    if (participantId) return participantId;
  }

  if (email) {
    participantId = await insertParticipant(client, { ...payload, email: null });
    if (participantId) return participantId;
  }

  if (telephone) {
    participantId = await insertParticipant(client, {
      ...payload,
      telephone: null,
    });
    if (participantId) return participantId;
  }

  if (email || telephone) {
    participantId = await insertParticipant(client, {
      ...payload,
      email: null,
      telephone: null,
    });
  }

  return participantId;
}

async function importParticipantsRows(client, rows, activityId) {
  let imported = 0;
  let skippedMissingName = 0;
  let duplicatesInActivity = 0;

  for (const row of rows) {
    const parsed = parseParticipantRow(row);

    if (!parsed.nom || !parsed.prenom) {
      skippedMissingName++;
      continue;
    }

    const payload = {
      ...parsed,
      normalizedGender: normalizeGender(parsed.genre),
    };

    const participantId = await resolveParticipantId(client, payload);
    if (!participantId) continue;

    const linkResult = await client.query(
      `
      INSERT INTO activity_participants
      (activity_id, participant_id)
      VALUES ($1,$2)
      ON CONFLICT DO NOTHING
      RETURNING participant_id
      `,
      [activityId, participantId]
    );

    if (linkResult.rowCount > 0) imported++;
    else duplicatesInActivity++;
  }

  return { imported, skippedMissingName, duplicatesInActivity };
}

/* ===== DOWNLOAD TEMPLATE XLSX ===== */
router.get("/template", authMiddleware, (req, res) => {
  const wb = xlsx.utils.book_new();

  const headers = [
    "Activite",
    "Date_activite",
    "Nom",
    "Prenom",
    "Genre",
    "Tranche_age",
    "Email",
    "Telephone",
    "Statut",
    "Structure",
  ];

  const example = [
    "Nom de l activite",
    "2025-01-15",
    "Diallo",
    "Aminata",
    "F",
    "18-25",
    "aminata@example.com",
    "770000000",
    "Participant",
    "Universite Cheikh Anta Diop",
  ];

  const ws = xlsx.utils.aoa_to_sheet([headers, example]);

  // Largeurs de colonnes lisibles
  ws["!cols"] = headers.map(() => ({ wch: 22 }));

  xlsx.utils.book_append_sheet(wb, ws, "Liste de presences");

  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="template_liste_presences.xlsx"'
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.send(buffer);
});

/* ===== CREATE ACTIVITY + IMPORT PARTICIPANTS ===== */
router.post(
  "/activity",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;
    try {
      if (req.user.role === "viewer") {
        return res.status(403).json({ error: "Acces refuse" });
      }

      const {
        title,
        description,
        activity_date,
        duration_hours,
        location,
        device_id,
        partner_id,
      } = req.body;

      if (!title || !activity_date) {
        return res.status(400).json({ error: "Titre et date requis" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "Fichier Excel requis" });
      }

      let resolvedPartnerId = partner_id || null;
      if (req.user.role === "partner") {
        resolvedPartnerId = req.user.partner_id;
      }

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        return res.status(400).json({ error: "Fichier Excel vide" });
      }

      await client.query("BEGIN");
      inTransaction = true;

      const activityResult = await client.query(
        `
        INSERT INTO activities
        (title, description, activity_date, duration_hours, location, device_id, partner_id, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
        `,
        [
          title,
          description || null,
          activity_date,
          duration_hours || null,
          location || null,
          device_id || null,
          resolvedPartnerId,
          req.user.id,
        ]
      );

      const activity = activityResult.rows[0];
      const stats = await importParticipantsRows(client, rows, activity.id);

      await client.query("COMMIT");
      inTransaction = false;

      res.status(201).json({
        message: "Import termine",
        activity,
        participants_importes: stats.imported,
        total_lignes: rows.length,
        lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
        doublons_dans_activite: stats.duplicatesInActivity,
      });
    } catch (err) {
      if (inTransaction) {
        await client.query("ROLLBACK");
      }
      console.error(err);
      res.status(500).json({ error: "Erreur import Excel" });
    } finally {
      client.release();
      safeUnlink(req.file?.path);
    }
  }
);

/* ===== IMPORT PARTICIPANTS ===== */
router.post(
  "/participants/:activityId",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    const client = await pool.connect();
    let inTransaction = false;
    try {
      const { activityId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: "Fichier Excel requis" });
      }

      const activityResult = await client.query(
        "SELECT title, activity_date, partner_id FROM activities WHERE id = $1",
        [activityId]
      );

      if (activityResult.rows.length === 0) {
        return res.status(404).json({ error: "Activite introuvable" });
      }

      const activity = activityResult.rows[0];
      if (
        req.user.role === "partner" &&
        activity.partner_id !== req.user.partner_id
      ) {
        return res.status(403).json({ error: "Acces refuse" });
      }

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        return res.status(400).json({ error: "Fichier Excel vide" });
      }

      const firstRow = normalizeRow(rows[0]);
      const excelActivity = firstRow.activite || firstRow.activity || null;
      const excelDate = firstRow.date_activite || firstRow.activity_date || null;

      if (
        excelActivity !== activity.title ||
        !excelDate ||
        new Date(excelDate).toISOString().slice(0, 10) !==
          new Date(activity.activity_date).toISOString().slice(0, 10)
      ) {
        return res.status(400).json({
          error: "Intitule ou date activite ne correspondent pas",
        });
      }

      await client.query("BEGIN");
      inTransaction = true;

      const stats = await importParticipantsRows(client, rows, activityId);

      await client.query("COMMIT");
      inTransaction = false;

      res.json({
        message: "Import termine avec succes",
        activite: activity.title,
        date: activity.activity_date,
        participants_importes: stats.imported,
        total_lignes: rows.length,
        lignes_ignorees_nom_prenom_manquants: stats.skippedMissingName,
        doublons_dans_activite: stats.duplicatesInActivity,
      });
    } catch (err) {
      if (inTransaction) {
        await client.query("ROLLBACK");
      }
      console.error(err);
      res.status(500).json({ error: "Erreur import Excel" });
    } finally {
      client.release();
      safeUnlink(req.file?.path);
    }
  }
);

module.exports = router;
