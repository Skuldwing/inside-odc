const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { sendEmail } = require("../services/mail");
const { generateAttestationPDF } = require("../services/attestation");
const { getTemplate, renderTemplate } = require("./emailTemplates.routes");

const router = express.Router();

function requireAdminOrPartner(req, res, next) {
  if (req.user.role === "viewer") {
    return res.status(403).json({ error: "Accès refusé" });
  }
  next();
}

/* ===== GET ACTIVITIES ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT a.*,
             p.name AS partner_name,
             d.name AS device_name,
             COALESCE(ap.participants_count, 0) AS participants_count
      FROM activities a
      LEFT JOIN partners p ON a.partner_id = p.id
      LEFT JOIN devices d ON a.device_id = d.id
      LEFT JOIN (
        SELECT activity_id, COUNT(*)::int AS participants_count
        FROM activity_participants
        GROUP BY activity_id
      ) ap ON ap.activity_id = a.id
    `;

    const params = [];

    // Partner ne voit que ses activités
    if (req.user.role === "partner") {
      query += " WHERE a.partner_id = $1";
      params.push(req.user.partner_id);
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
router.post("/", authMiddleware, requireAdminOrPartner, async (req, res) => {
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
    if (req.user.role === "partner") {
      resolvedPartnerId = req.user.partner_id;
    }

    const result = await pool.query(
      `
      INSERT INTO activities
      (title, description, activity_date, date_fin, duration_hours, location, device_id, partner_id, created_by, participants_manual)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
      `,
      [
        title,
        description,
        activity_date,
        date_fin || null,
        duration_hours || null,
        location,
        device_id,
        resolvedPartnerId,
        req.user.id,
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE ACTIVITY ===== */
router.put("/:id", authMiddleware, requireAdminOrPartner, async (req, res) => {
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
      "SELECT id, partner_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (
      req.user.role === "partner" &&
      existing.rows[0].partner_id !== req.user.partner_id
    ) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const resolvedPartnerId =
      req.user.role === "partner" ? req.user.partner_id : partner_id || null;

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
          participants_manual = $9
      WHERE id = $10
      RETURNING *
      `,
      [
        title,
        description || null,
        activity_date,
        date_fin || null,
        duration_hours || null,
        location || null,
        device_id || null,
        resolvedPartnerId,
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
        id,
      ]
    );

    res.json(result.rows[0]);
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
      `SELECT a.title, a.activity_date, a.partner_id, p.name AS partner_name
       FROM activities a LEFT JOIN partners p ON p.id = a.partner_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activite introuvable" });

    const activity = actRes.rows[0];

    if (req.user.role === "partner" && activity.partner_id !== req.user.partner_id) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    if (req.user.role === "viewer") {
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
router.post("/:id/send-attestations", authMiddleware, requireAdminOrPartner, async (req, res) => {
  try {
    const { id } = req.params;

    const actRes = await pool.query(
      `SELECT a.*, p.name AS partner_name, d.name AS device_name
       FROM activities a
       LEFT JOIN partners p ON p.id = a.partner_id
       LEFT JOIN devices  d ON d.id  = a.device_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) {
      return res.status(404).json({ error: "Activité introuvable" });
    }
    const activity = actRes.rows[0];

    if (req.user.role === "partner" && activity.partner_id !== req.user.partner_id) {
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
          partner: activity.partner_name,
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
          partenaire: activity.partner_name || "",
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

/* ===== DELETE ACTIVITY ===== */
router.delete("/:id", authMiddleware, requireAdminOrPartner, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      "SELECT id, partner_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (
      req.user.role === "partner" &&
      existing.rows[0].partner_id !== req.user.partner_id
    ) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const result = await pool.query(
      "DELETE FROM activities WHERE id = $1 RETURNING id",
      [id]
    );

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
