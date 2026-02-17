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
  const v = String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["m", "h", "homme", "male", "masculin"].includes(v)) return "H";
  if (["f", "femme", "female", "feminin", "féminin"].includes(v)) return "F";
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


/* ===== CREATE ACTIVITY + IMPORT PARTICIPANTS ===== */
router.post(
  "/activity",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    const client = await pool.connect();
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

      await client.query("BEGIN");

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

      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Fichier Excel vide" });
      }

      let imported = 0;

      for (const row of rows) {
        const normalized = normalizeRow(row);
        const nom = normalized.nom || normalized.last_name || null;
        const prenom = normalized.prenom || normalized.first_name || null;
        const genre = normalized.genre || normalized.gender || null;
        const email = normalized.email || null;
        const telephone = normalized.telephone || normalized.phone || null;
        const statut = normalized.statut || normalized.status || null;
        const structure = normalized.structure || null;
        const ageRange =
          normalized.tranche_age ||
          normalized.tranche_dage ||
          normalized.tranche_age_ ||
          normalized.age_range ||
          null;


        if (!nom || !prenom) continue;
        const normalizedGender = normalizeGender(genre);

        let participantId = null;
        if (email) {
          const existingByEmail = await client.query(
            `
            SELECT id
            FROM participants
            WHERE email = $1
            LIMIT 1
            `,
            [email]
          );
          participantId = existingByEmail.rows[0]?.id || null;
        } else if (telephone) {
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
          participantId = existingByPhoneAndName.rows[0]?.id || null;
        }

        if (!participantId) {
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
          participantId = insertResult.rows[0]?.id || null;
          if (!participantId && email) {
            const existingAfterConflict = await client.query(
              `
              SELECT id
              FROM participants
              WHERE email = $1
              LIMIT 1
              `,
              [email]
            );
            participantId = existingAfterConflict.rows[0]?.id || null;
          }

          if (!participantId && telephone) {
            const existingAfterConflict = await client.query(
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
            participantId = existingAfterConflict.rows[0]?.id || null;
          }

          if (!participantId && telephone) {
            const insertWithoutPhone = await client.query(
              `
              INSERT INTO participants
              (nom, prenom, genre, age_range, email, telephone, statut, structure)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              RETURNING id
              `,
              [
                nom,
                prenom,
                normalizedGender,
                ageRange || null,
                email || null,
                null,
                statut || null,
                structure || null,
              ]
            );
            participantId = insertWithoutPhone.rows[0]?.id || null;
          }

          if (!participantId) continue;
        } else {
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

        const linkResult = await client.query(
          `
          INSERT INTO activity_participants
          (activity_id, participant_id)
          VALUES ($1,$2)
          ON CONFLICT DO NOTHING
          RETURNING participant_id
          `,
          [activity.id, participantId]
        );

        if (linkResult.rowCount > 0) {
          imported++;
        }
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Import termine",
        activity,
        participants_importes: imported,
      });
    } catch (err) {
      await client.query("ROLLBACK");
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
    try {
      const { activityId } = req.params;

      if (!req.file) {
        return res.status(400).json({ error: "Fichier Excel requis" });
      }

      /* ===== GET ACTIVITY ===== */
      const activityResult = await pool.query(
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

      /* ===== READ EXCEL ===== */
      const workbook = xlsx.readFile(req.file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        return res.status(400).json({ error: "Fichier Excel vide" });
      }

      /* ===== VALIDATE ACTIVITY META ===== */
      const excelActivity = rows[0].activite;
      const excelDate = rows[0].date_activite;

      if (
        excelActivity !== activity.title ||
        new Date(excelDate).toISOString().slice(0, 10) !==
          new Date(activity.activity_date).toISOString().slice(0, 10)
      ) {
        return res.status(400).json({
          error: "Intitule ou date activite ne correspondent pas",
        });
      }

      let imported = 0;

      for (const row of rows) {
        const normalized = normalizeRow(row);
        const nom = normalized.nom || normalized.last_name || null;
        const prenom = normalized.prenom || normalized.first_name || null;
        const genre = normalized.genre || normalized.gender || null;
        const email = normalized.email || null;
        const telephone = normalized.telephone || normalized.phone || null;
        const statut = normalized.statut || normalized.status || null;
        const structure = normalized.structure || null;
        const ageRange =
          normalized.tranche_age ||
          normalized.tranche_dage ||
          normalized.tranche_age_ ||
          normalized.age_range ||
          null;


        if (!nom || !prenom) continue;
        const normalizedGender = normalizeGender(genre);

        let participantId = null;
        if (email) {
          const existingByEmail = await pool.query(
            `
            SELECT id
            FROM participants
            WHERE email = $1
            LIMIT 1
            `,
            [email]
          );
          participantId = existingByEmail.rows[0]?.id || null;
        } else if (telephone) {
          const existingByPhoneAndName = await pool.query(
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
          participantId = existingByPhoneAndName.rows[0]?.id || null;
        }

        if (!participantId) {
          const participantResult = await pool.query(
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
          participantId = participantResult.rows[0]?.id || null;
          if (!participantId && email) {
            const existingAfterConflict = await pool.query(
              `
              SELECT id
              FROM participants
              WHERE email = $1
              LIMIT 1
              `,
              [email]
            );
            participantId = existingAfterConflict.rows[0]?.id || null;
          }

          if (!participantId && telephone) {
            const existingAfterConflict = await pool.query(
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
            participantId = existingAfterConflict.rows[0]?.id || null;
          }

          if (!participantId && telephone) {
            const insertWithoutPhone = await pool.query(
              `
              INSERT INTO participants
              (nom, prenom, genre, age_range, email, telephone, statut, structure)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
              RETURNING id
              `,
              [
                nom,
                prenom,
                normalizedGender,
                ageRange || null,
                email || null,
                null,
                statut || null,
                structure || null,
              ]
            );
            participantId = insertWithoutPhone.rows[0]?.id || null;
          }

          if (!participantId) continue;
        } else {
          await pool.query(
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

        /* ===== LINK TO ACTIVITY ===== */
        const linkResult = await pool.query(
          `
          INSERT INTO activity_participants
          (activity_id, participant_id)
          VALUES ($1,$2)
          ON CONFLICT DO NOTHING
          RETURNING participant_id
          `,
          [activityId, participantId]
        );

        if (linkResult.rowCount > 0) {
          imported++;
        }
      }

      res.json({
        message: "Import termine avec succes",
        activite: activity.title,
        date: activity.activity_date,
        participants_importes: imported,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur import Excel" });
    } finally {
      safeUnlink(req.file?.path);
    }
  }
);

module.exports = router;

