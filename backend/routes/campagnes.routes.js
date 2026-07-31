const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const pool = require("../db");
const { sendEmail } = require("../services/mail");

const router = express.Router();

/* ===== GET ALL ===== */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, type, message, subject, html_body,
              recipients_type, activity_id, custom_emails,
              send_mode, sent_count, failed_count, sent_at, status, created_at
       FROM campagnes
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE ===== */
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      name, type = "email", message = "",
      subject = "", html_body = "",
      recipients_type = "all_participants",
      activity_id = null,
      custom_emails = "[]",
      send_mode = "publipostage",
      status = "brouillon",
    } = req.body;

    if (!name) return res.status(400).json({ error: "Nom requis" });

    const result = await pool.query(
      `INSERT INTO campagnes
         (name, type, message, subject, html_body, recipients_type,
          activity_id, custom_emails, send_mode, sent_count, failed_count, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,$10,NOW())
       RETURNING *`,
      [name, type, message, subject, html_body, recipients_type,
       activity_id || null, custom_emails, send_mode, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE ===== */
router.put("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, type = "email", message = "",
      subject = "", html_body = "",
      recipients_type = "all_participants",
      activity_id = null,
      custom_emails = "[]",
      send_mode = "publipostage",
      status = "brouillon",
    } = req.body;

    if (!name) return res.status(400).json({ error: "Nom requis" });

    const result = await pool.query(
      `UPDATE campagnes
       SET name=$1, type=$2, message=$3, subject=$4, html_body=$5,
           recipients_type=$6, activity_id=$7, custom_emails=$8, send_mode=$9, status=$10
       WHERE id=$11
       RETURNING *`,
      [name, type, message, subject, html_body, recipients_type,
       activity_id || null, custom_emails, send_mode, status, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Campagne introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE ===== */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM campagnes WHERE id=$1 RETURNING id", [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Campagne introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SEND ===== */
router.post("/:id/send", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const campRes = await pool.query("SELECT * FROM campagnes WHERE id=$1", [id]);
    if (!campRes.rows.length) return res.status(404).json({ error: "Campagne introuvable" });

    const camp = campRes.rows[0];
    if (!camp.subject) return res.status(400).json({ error: "L'objet de l'email est requis" });
    if (!camp.html_body) return res.status(400).json({ error: "Le corps de l'email est requis" });

    /* Récupérer les destinataires */
    let recipients = [];

    if (camp.recipients_type === "all_participants") {
      const r = await pool.query(
        `SELECT DISTINCT email, full_name
         FROM participants
         WHERE email IS NOT NULL AND TRIM(email) != ''
         ORDER BY email`
      );
      recipients = r.rows;

    } else if (camp.recipients_type === "all_partners") {
      const r = await pool.query(
        `SELECT DISTINCT email, name AS full_name
         FROM partners
         WHERE email IS NOT NULL AND TRIM(email) != ''
         ORDER BY email`
      );
      recipients = r.rows;

    } else if (camp.recipients_type === "by_activity" && camp.activity_id) {
      const r = await pool.query(
        `SELECT DISTINCT p.email, p.full_name
         FROM participants p
         JOIN activity_participants ap ON ap.participant_id = p.id
         WHERE ap.activity_id = $1
           AND p.email IS NOT NULL AND TRIM(p.email) != ''`,
        [camp.activity_id]
      );
      recipients = r.rows;

    } else if (camp.recipients_type === "custom") {
      try {
        const emails = JSON.parse(camp.custom_emails || "[]");
        recipients = emails
          .map(e => ({ email: String(e).trim(), full_name: String(e).trim() }))
          .filter(r => r.email.includes("@"));
      } catch { recipients = []; }
    }

    if (!recipients.length) {
      return res.status(400).json({ error: "Aucun destinataire trouvé pour cette campagne" });
    }

    /* Marquer en cours */
    await pool.query(
      "UPDATE campagnes SET status='en_cours', sent_at=NOW() WHERE id=$1", [id]
    );

    const textFallback = (camp.html_body || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const sendMode = camp.send_mode || "publipostage";
    let sent = 0, failed = 0;

    if (sendMode === "publipostage") {
      /* Un email individuel par destinataire */
      for (const r of recipients) {
        try {
          await sendEmail({
            toEmail: r.email,
            toName:  r.full_name || r.email,
            subject: camp.subject,
            html:    camp.html_body,
            text:    textFallback,
          });
          sent++;
        } catch (err) {
          console.error(`[campagne ${id}] échec ${r.email}:`, err.message);
          failed++;
        }
      }

    } else if (sendMode === "bcc") {
      /* Un seul email, tous en copie cachée */
      const MAIL_FROM = process.env.MAIL_FROM;
      const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Inside ODC";
      try {
        await sendEmail({
          toEmail: MAIL_FROM,
          toName:  MAIL_FROM_NAME,
          subject: camp.subject,
          html:    camp.html_body,
          text:    textFallback,
          bcc:     recipients.map(r => ({ email: r.email, name: r.full_name || r.email })),
        });
        sent = recipients.length;
      } catch (err) {
        console.error(`[campagne ${id}] échec BCC:`, err.message);
        failed = recipients.length;
      }

    } else if (sendMode === "cc") {
      /* Un seul email, tous en copie visible */
      const [first, ...rest] = recipients;
      try {
        await sendEmail({
          toEmail: first.email,
          toName:  first.full_name || first.email,
          subject: camp.subject,
          html:    camp.html_body,
          text:    textFallback,
          cc:      rest.map(r => ({ email: r.email, name: r.full_name || r.email })),
        });
        sent = recipients.length;
      } catch (err) {
        console.error(`[campagne ${id}] échec CC:`, err.message);
        failed = recipients.length;
      }
    }

    await pool.query(
      "UPDATE campagnes SET status='envoyee', sent_count=$1, failed_count=$2 WHERE id=$3",
      [sent, failed, id]
    );

    res.json({ sent, failed, total: recipients.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'envoi" });
  }
});

module.exports = router;
