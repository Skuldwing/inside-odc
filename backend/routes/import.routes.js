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
  const v = String(value).trim().toLowerCase();
  if (["m", "h", "homme", "male", "masculin"].includes(v)) return "H";
  if (["f", "femme", "female", "feminin", "féminin"].includes(v)) return "F";
  return null;
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
        const {
          nom,
          prenom,
          genre,
          email,
          telephone,
          statut,
          structure,
        } = row;

        if (!nom || !prenom) continue;
        const normalizedGender = normalizeGender(genre);

        let participantId = null;
        if (email) {
          const existing = await client.query(
            "SELECT id FROM participants WHERE email = $1",
            [email]
          );
          participantId = existing.rows[0]?.id || null;
        } else if (telephone) {
          const existing = await client.query(
            "SELECT id FROM participants WHERE telephone = $1",
            [telephone]
          );
          participantId = existing.rows[0]?.id || null;
        }

        if (!participantId) {
          const insertResult = await client.query(
            `
            INSERT INTO participants
            (first_name, last_name, gender, age_range, status, structure, email, phone,
             nom, prenom, genre, telephone, statut)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id
            `,
            [
              prenom,
              nom,
              normalizedGender,
              null,
              statut || null,
              structure || null,
              email || null,
              telephone || null,
              nom,
              prenom,
              normalizedGender,
              telephone || null,
              statut || null,
            ]
          );
          participantId = insertResult.rows[0].id;
        } else {
          await client.query(
            `
            UPDATE participants
            SET
              first_name = COALESCE(first_name, $1),
              last_name = COALESCE(last_name, $2),
              gender = COALESCE(gender, $3),
              status = COALESCE(status, $4),
              structure = COALESCE(structure, $5),
              email = COALESCE(email, $6),
              phone = COALESCE(phone, $7),
              nom = COALESCE(nom, $8),
              prenom = COALESCE(prenom, $9),
              genre = COALESCE(genre, $10),
              telephone = COALESCE(telephone, $11),
              statut = COALESCE(statut, $12)
            WHERE id = $13
            `,
            [
              prenom,
              nom,
              normalizedGender,
              statut || null,
              structure || null,
              email || null,
              telephone || null,
              nom,
              prenom,
              normalizedGender,
              telephone || null,
              statut || null,
              participantId,
            ]
          );
        }

        await client.query(
          `
          INSERT INTO activity_participants
          (activity_id, participant_id)
          VALUES ($1,$2)
          ON CONFLICT DO NOTHING
          `,
          [activity.id, participantId]
        );

        imported++;
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
        const {
          nom,
          prenom,
          genre,
          email,
          telephone,
          statut,
          structure,
        } = row;

        if (!nom || !prenom) continue;
        const normalizedGender = normalizeGender(genre);

        let participantId = null;
        if (email) {
          const existing = await pool.query(
            "SELECT id FROM participants WHERE email = $1",
            [email]
          );
          participantId = existing.rows[0]?.id || null;
        } else if (telephone) {
          const existing = await pool.query(
            "SELECT id FROM participants WHERE telephone = $1",
            [telephone]
          );
          participantId = existing.rows[0]?.id || null;
        }

        if (!participantId) {
          const participantResult = await pool.query(
            `
            INSERT INTO participants
            (first_name, last_name, gender, age_range, status, structure, email, phone,
             nom, prenom, genre, telephone, statut)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            RETURNING id
            `,
            [
              prenom,
              nom,
              normalizedGender,
              null,
              statut || null,
              structure || null,
              email || null,
              telephone || null,
              nom,
              prenom,
              normalizedGender,
              telephone || null,
              statut || null,
            ]
          );
          participantId = participantResult.rows[0].id;
        } else {
          await pool.query(
            `
            UPDATE participants
            SET
              first_name = COALESCE(first_name, $1),
              last_name = COALESCE(last_name, $2),
              gender = COALESCE(gender, $3),
              status = COALESCE(status, $4),
              structure = COALESCE(structure, $5),
              email = COALESCE(email, $6),
              phone = COALESCE(phone, $7),
              nom = COALESCE(nom, $8),
              prenom = COALESCE(prenom, $9),
              genre = COALESCE(genre, $10),
              telephone = COALESCE(telephone, $11),
              statut = COALESCE(statut, $12)
            WHERE id = $13
            `,
            [
              prenom,
              nom,
              normalizedGender,
              statut || null,
              structure || null,
              email || null,
              telephone || null,
              nom,
              prenom,
              normalizedGender,
              telephone || null,
              statut || null,
              participantId,
            ]
          );
        }

        /* ===== LINK TO ACTIVITY ===== */
        await pool.query(
          `
          INSERT INTO activity_participants
          (activity_id, participant_id)
          VALUES ($1,$2)
          ON CONFLICT DO NOTHING
          `,
          [activityId, participantId]
        );

        imported++;
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
