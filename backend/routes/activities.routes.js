const express = require("express");
const multer = require("multer");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { sendEmail } = require("../services/mail");
const { generateAttestationPDF } = require("../services/attestation");
const { getTemplate, renderTemplate } = require("./emailTemplates.routes");
const { logAudit } = require("../services/audit");

const router = express.Router();

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function requireWriteAccess(req, res, next) {
  if (req.user.role === "viewer") {
    return res.status(403).json({ error: "Accès refusé" });
  }
  next();
}

function isOwner(req, activity) {
  if (req.user.role === "partner") return activity.partner_id === req.user.partner_id;
  if (req.user.role === "coach") return activity.coach_id === req.user.id;
  return true; // admin
}

/* ===== GET ACTIVITIES ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT a.*,
             p.name AS partner_name,
             d.name AS device_name,
             u.full_name AS coach_name,
             COALESCE(ap.participants_count, 0) AS participants_count
      FROM activities a
      LEFT JOIN partners p ON a.partner_id = p.id
      LEFT JOIN devices d ON a.device_id = d.id
      LEFT JOIN users u ON a.coach_id = u.id
      LEFT JOIN (
        SELECT activity_id, COUNT(*)::int AS participants_count
        FROM activity_participants
        GROUP BY activity_id
      ) ap ON ap.activity_id = a.id
    `;

    const params = [];

    if (req.user.role === "partner") {
      query += " WHERE a.partner_id = $1";
      params.push(req.user.partner_id);
    } else if (req.user.role === "coach") {
      query += " WHERE a.coach_id = $1";
      params.push(req.user.id);
    }

    query += " ORDER BY a.activity_date DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE ACTIVITY ===== */
router.post("/", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const {
      title,
      description,
      activity_date,
      date_fin,
      duration_hours,
      location,
      device_id,
      partner_id,
      participants_manual,
    } = req.body;

    if (!title || !activity_date) {
      return res.status(400).json({ error: "Titre et date requis" });
    }

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

    const resolvedMode = ["ligne", "presentiel"].includes(req.body.mode)
      ? req.body.mode
      : "presentiel";

    const result = await pool.query(
      `
      INSERT INTO activities
      (title, description, activity_date, date_fin, duration_hours, location, device_id, partner_id, created_by, participants_manual, coach_id, mode)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
      `,
      [
        title,
        description,
        activity_date,
        date_fin || null,
        duration_hours || null,
        location,
        resolvedDeviceId,
        resolvedPartnerId,
        req.user.id,
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
        resolvedCoachId,
        resolvedMode,
      ]
    );

    const created = result.rows[0];
    logAudit(req, "CREATE", "activities", created.id, created.title, {
      date: created.activity_date,
      mode: created.mode,
      lieu: created.location || null,
      duree_heures: created.duration_hours || null,
      participants_manuels: created.participants_manual || null,
    });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE ACTIVITY ===== */
router.put("/:id", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      activity_date,
      date_fin,
      duration_hours,
      location,
      device_id,
      partner_id,
      participants_manual,
    } = req.body;

    if (!title || !activity_date) {
      return res.status(400).json({ error: "Titre et date requis" });
    }

    const existing = await pool.query(
      "SELECT id, title, activity_date, date_fin, location, duration_hours, mode, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (!isOwner(req, existing.rows[0])) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const before = existing.rows[0];

    const resolvedPartnerId =
      req.user.role === "partner" ? req.user.partner_id
      : req.user.role === "coach" ? null
      : partner_id || null;

    const resolvedDeviceId = req.user.role === "coach" ? null : device_id || null;

    const resolvedMode = ["ligne", "presentiel"].includes(req.body.mode)
      ? req.body.mode
      : "presentiel";

    const result = await pool.query(
      `
      UPDATE activities
      SET title = $1,
          description = $2,
          activity_date = $3,
          date_fin = $4,
          duration_hours = $5,
          location = $6,
          device_id = $7,
          partner_id = $8,
          participants_manual = $9,
          mode = $10
      WHERE id = $11
      RETURNING *
      `,
      [
        title,
        description || null,
        activity_date,
        date_fin || null,
        duration_hours || null,
        location || null,
        resolvedDeviceId,
        resolvedPartnerId,
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
        resolvedMode,
        id,
      ]
    );

    const updated = result.rows[0];
    const toDate = (v) => v ? String(v).slice(0, 10) : null;
    const modifications = {};
    if (before.title !== updated.title) modifications.titre = { avant: before.title, apres: updated.title };
    if (toDate(before.activity_date) !== toDate(updated.activity_date)) modifications.date = { avant: toDate(before.activity_date), apres: toDate(updated.activity_date) };
    if (toDate(before.date_fin) !== toDate(updated.date_fin)) modifications.date_fin = { avant: toDate(before.date_fin), apres: toDate(updated.date_fin) };
    if ((before.location || null) !== (updated.location || null)) modifications.lieu = { avant: before.location || null, apres: updated.location || null };
    if ((before.mode || null) !== (updated.mode || null)) modifications.mode = { avant: before.mode, apres: updated.mode };
    if (String(before.duration_hours ?? "") !== String(updated.duration_hours ?? "")) modifications.duree_heures = { avant: before.duration_hours, apres: updated.duration_hours };
    logAudit(req, "UPDATE", "activities", updated.id, updated.title, {
      modifications: Object.keys(modifications).length > 0 ? modifications : undefined,
      date: updated.activity_date,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== EXPORT LISTE PRESENCES PAR ACTIVITE ===== */
router.get("/:id/participants/export", authMiddleware, async (req, res) => {
  try {
    const XLSX = require("xlsx");
    const { id } = req.params;

    const actRes = await pool.query(
      `SELECT a.title, a.activity_date, a.partner_id, a.coach_id, p.name AS partner_name
       FROM activities a LEFT JOIN partners p ON p.id = a.partner_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activite introuvable" });

    const activity = actRes.rows[0];

    if (req.user.role === "viewer") {
      return res.status(403).json({ error: "Accès refusé" });
    }
    if (!isOwner(req, activity)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const partRes = await pool.query(
      `SELECT p.prenom, p.nom, p.telephone, p.email, p.genre, p.age_range, p.structure
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       WHERE ap.activity_id = $1
       ORDER BY p.nom, p.prenom`,
      [id]
    );

    const rows = partRes.rows.map((p) => ({
      "Prenom": p.prenom || "",
      "Nom": p.nom || "",
      "Telephone": p.telephone || "",
      "Email": p.email || "",
      "Genre": p.genre === "F" ? "Femme" : p.genre === "H" ? "Homme" : p.genre || "",
      "Tranche d'age": p.age_range || "",
      "Structure / Etablissement": p.structure || "",
    }));

    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0
        ? rows
        : [{ "Prenom": "", "Nom": "", "Telephone": "", "Email": "", "Genre": "", "Tranche d'age": "", "Structure / Etablissement": "" }]
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presences");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeName = activity.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const filename = `presences_${safeName}_${activity.activity_date}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SEND ATTESTATIONS ===== */
router.post("/:id/send-attestations", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const actRes = await pool.query(
      `SELECT a.*, p.name AS partner_name, d.name AS device_name, u.full_name AS coach_name
       FROM activities a
       LEFT JOIN partners p ON p.id = a.partner_id
       LEFT JOIN devices  d ON d.id  = a.device_id
       LEFT JOIN users    u ON u.id  = a.coach_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) {
      return res.status(404).json({ error: "Activité introuvable" });
    }
    const activity = actRes.rows[0];

    if (!isOwner(req, activity)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const partRes = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.email
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       WHERE ap.activity_id = $1
       ORDER BY p.nom, p.prenom`,
      [id]
    );

    const participants = partRes.rows;
    const withEmail = participants.filter((p) => p.email);
    const withoutEmail = participants.filter((p) => !p.email);

    if (withEmail.length === 0) {
      return res.status(200).json({
        sent: 0,
        skipped: withoutEmail.length,
        message: "Aucun participant avec adresse email.",
      });
    }

    let sent = 0;
    const errors = [];

    for (const participant of withEmail) {
      try {
        const pdfBuffer = await generateAttestationPDF({
          participant,
          activity,
          partner: activity.partner_name || activity.coach_name,
          device: activity.device_name,
        });

        const fullName =
          [participant.prenom, participant.nom].filter(Boolean).join(" ") ||
          participant.email;

        const safeName = (activity.title || "activite")
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase();

        const tpl = await getTemplate("attestation");
        const tplVars = {
          nom: fullName,
          activite: activity.title,
          date: activity.activity_date ? new Date(activity.activity_date).toLocaleDateString("fr-FR") : "",
          partenaire: activity.partner_name || activity.coach_name || "",
          dispositif: activity.device_name || "",
          duree: activity.duration_hours ? `${activity.duration_hours}h` : "",
        };

        await sendEmail({
          toEmail: participant.email,
          toName: fullName,
          subject: renderTemplate(tpl.subject, tplVars),
          html: renderTemplate(tpl.body_html, tplVars),
          text: `Bonjour ${fullName},\n\nVeuillez trouver ci-joint votre attestation de participation à "${activity.title}".\n\n— ODC Sénégal`,
          attachments: [
            {
              filename: `attestation_${safeName}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });

        sent++;
      } catch (err) {
        console.error(`Attestation error for ${participant.email}:`, err.message);
        errors.push(participant.email);
      }
    }

    res.json({
      sent,
      skipped: withoutEmail.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${sent} attestation(s) envoyée(s)${withoutEmail.length > 0 ? `, ${withoutEmail.length} ignorée(s) (pas d'email)` : ""}.`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPLOAD RAPPORT ===== */
router.post("/:id/report", authMiddleware, requireWriteAccess, reportUpload.single("report"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });

    const actRes = await pool.query(
      "SELECT id, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    if (!isOwner(req, actRes.rows[0])) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    await pool.query(
      "UPDATE activities SET report_filename = $1, report_data = $2 WHERE id = $3",
      [req.file.originalname, req.file.buffer, id]
    );

    res.json({ success: true, filename: req.file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== TÉLÉCHARGER RAPPORT ===== */
router.get("/:id/report", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Sélectionner les métadonnées d'abord pour éviter de charger le BYTEA inutilement
    const metaRes = await pool.query(
      "SELECT report_filename, partner_id, coach_id, octet_length(report_data) AS data_size FROM activities WHERE id = $1",
      [id]
    );
    if (!metaRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    const meta = metaRes.rows[0];
    if (!meta.data_size) return res.status(404).json({ error: "Aucun rapport disponible" });

    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });
    if (!isOwner(req, meta)) return res.status(403).json({ error: "Accès refusé" });

    // Charger les données binaires seulement si autorisé
    const dataRes = await pool.query(
      "SELECT report_data FROM activities WHERE id = $1",
      [id]
    );
    const rawData = dataRes.rows[0]?.report_data;
    if (!rawData) return res.status(404).json({ error: "Aucun rapport disponible" });

    const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);

    const filename = meta.report_filename
      ? (meta.report_filename.toLowerCase().endsWith(".pdf") ? meta.report_filename : meta.report_filename + ".pdf")
      : "rapport.pdf";
    const disposition = req.query.inline === "1" ? "inline" : "attachment";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (err) {
    console.error("[REPORT]", err);
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE ACTIVITY ===== */
router.delete("/:id", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      "SELECT id, title, activity_date, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (!isOwner(req, existing.rows[0])) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const deletedActivity = existing.rows[0];

    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM activity_participants WHERE activity_id = $1", [id]);
      result = await client.query("DELETE FROM activities WHERE id = $1 RETURNING id", [id]);
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    logAudit(req, "DELETE", "activities", id, deletedActivity.title, {
      date: deletedActivity.activity_date,
      partner_id: deletedActivity.partner_id,
    });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
