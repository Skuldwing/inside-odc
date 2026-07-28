const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { sendEmail } = require("../services/mail");
const { createPasswordToken } = require("../services/passwordReset");
const { getTemplate, renderTemplate } = require("./emailTemplates.routes");
const requireAdminPin = require("../middleware/pin.middleware");
const crypto = require("crypto");
const { logAudit } = require("../services/audit");

const router = express.Router();

router.use(authMiddleware, requireAdmin, requireAdminPin);

async function hasUsersIsActiveColumn() {
  const result = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name = 'is_active'
    LIMIT 1
    `
  );
  return result.rowCount > 0;
}

/* ===== GET USERS ===== */
router.get("/", async (req, res) => {
  try {
    const hasIsActive = await hasUsersIsActiveColumn();
    const statusExpr = hasIsActive
      ? "CASE WHEN u.is_active = true THEN 'active' ELSE 'inactive' END"
      : "'active'";

    const result = await pool.query(
      `
      SELECT u.id, u.email, u.full_name, u.role, u.partner_id,
             p.name AS partner,
             ${statusExpr} AS status
      FROM users u
      LEFT JOIN partners p ON u.partner_id = p.id
      ORDER BY u.created_at DESC
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE USER ===== */
router.post("/", async (req, res) => {
  try {
    const {
      full_name,
      email,
      role = "viewer",
      partner_id = null,
      partner = null,
      status = "active",
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email requis" });
    }

    let resolvedPartnerId = partner_id || null;
    if (!resolvedPartnerId && partner) {
      const partnerResult = await pool.query(
        "SELECT id FROM partners WHERE name = $1",
        [partner]
      );
      resolvedPartnerId = partnerResult.rows[0]?.id || null;
    }

    const tempPassword = crypto.randomBytes(24).toString("hex");
    const hash = await bcrypt.hash(tempPassword, 10);
    const isActive = status !== "inactive";
    const hasIsActive = await hasUsersIsActiveColumn();

    const result = hasIsActive
      ? await pool.query(
          `
          INSERT INTO users (email, password, role, partner_id, full_name, is_active)
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING id, email, role, full_name, partner_id
          `,
          [email, hash, role, resolvedPartnerId, full_name || null, isActive]
        )
      : await pool.query(
          `
          INSERT INTO users (email, password, role, partner_id, full_name)
          VALUES ($1,$2,$3,$4,$5)
          RETURNING id, email, role, full_name, partner_id
          `,
          [email, hash, role, resolvedPartnerId, full_name || null]
        );

    const createdUser = result.rows[0];

    let inviteLink = null;
    try {
      const appUrl = process.env.APP_BASE_URL || "https://inside-odc.vercel.app";
      const token = await createPasswordToken(createdUser.id);
      const link = `${appUrl}/set-password?token=${token}`;
      inviteLink = link;

      const tpl = await getTemplate("welcome");
      const vars = { nom: full_name || email, email, lien: link };
      await sendEmail({
        toEmail: email,
        toName: full_name || email,
        subject: renderTemplate(tpl.subject, vars),
        html: renderTemplate(tpl.body_html, vars),
        text: `Bonjour ${full_name || email}\nDéfinir le mot de passe: ${link}\nCe lien est valable 24h.`,
      });
    } catch (err) {
      console.error("Erreur envoi email création utilisateur", err);
    }

    logAudit(req, "CREATE", "users", createdUser.id, createdUser.full_name || email, {
      email: createdUser.email,
      role: createdUser.role,
    });
    res.status(201).json({ ...createdUser, invite_link: inviteLink });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE USER ===== */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name,
      email,
      role,
      partner_id = null,
      partner = null,
      status = "active",
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email requis" });
    }

    let resolvedPartnerId = partner_id || null;
    if (!resolvedPartnerId && partner) {
      const partnerResult = await pool.query(
        "SELECT id FROM partners WHERE name = $1",
        [partner]
      );
      resolvedPartnerId = partnerResult.rows[0]?.id || null;
    }

    const isActive = status !== "inactive";
    const hasIsActive = await hasUsersIsActiveColumn();

    const result = hasIsActive
      ? await pool.query(
          `
          UPDATE users
          SET email = $1,
              role = $2,
              partner_id = $3,
              full_name = $4,
              is_active = $5
          WHERE id = $6
          RETURNING id, email, role, full_name, partner_id
          `,
          [email, role, resolvedPartnerId, full_name || null, isActive, id]
        )
      : await pool.query(
          `
          UPDATE users
          SET email = $1,
              role = $2,
              partner_id = $3,
              full_name = $4
          WHERE id = $5
          RETURNING id, email, role, full_name, partner_id
          `,
          [email, role, resolvedPartnerId, full_name || null, id]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const updatedUser = result.rows[0];
    logAudit(req, "UPDATE", "users", updatedUser.id, updatedUser.full_name || updatedUser.email, {
      email: updatedUser.email,
      role: updatedUser.role,
      status,
    });
    res.json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE (DEACTIVATE) USER ===== */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const targetUser = await pool.query("SELECT id, full_name, email, role FROM users WHERE id = $1", [id]);
    const hasIsActive = await hasUsersIsActiveColumn();
    const result = hasIsActive
      ? await pool.query(
          `
          UPDATE users
          SET is_active = false
          WHERE id = $1
          RETURNING id
          `,
          [id]
        )
      : await pool.query(
          `
          DELETE FROM users
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const tu = targetUser.rows[0];
    if (tu) {
      logAudit(req, "DELETE", "users", id, tu.full_name || tu.email, {
        email: tu.email,
        role: tu.role,
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== HARD DELETE USER ===== */
router.delete("/:id/hard-delete", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== RESET PASSWORD ===== */
router.post("/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT id, email, full_name
      FROM users
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const user = result.rows[0];

    if (!process.env.BREVO_API_KEY && !process.env.SMTP_HOST) {
      return res.status(503).json({ error: "Email non configuré. Ajoutez BREVO_API_KEY dans les variables Railway." });
    }

    const appUrl = process.env.APP_BASE_URL || "https://inside-odc.vercel.app";
    const token = await createPasswordToken(user.id);
    const link = `${appUrl}/set-password?token=${token}`;

    const tpl = await getTemplate("reset_password");
    const vars = { nom: user.full_name || user.email, lien: link };
    await sendEmail({
      toEmail: user.email,
      toName: user.full_name || user.email,
      subject: renderTemplate(tpl.subject, vars),
      html: renderTemplate(tpl.body_html, vars),
      text: `Bonjour ${user.full_name || user.email}\nLien de réinitialisation: ${link}\nCe lien est valable 24h.`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GENERATE RESET LINK ===== */
router.post("/:id/reset-link", async (req, res) => {
  try {
    const { id } = req.params;
    const userRes = await pool.query(
      "SELECT id, full_name, email FROM users WHERE id = $1",
      [id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const appUrl = process.env.APP_BASE_URL || "https://inside-odc.vercel.app";
    const token = await createPasswordToken(id);
    const link = `${appUrl}/set-password?token=${token}`;

    res.json({ link, full_name: userRes.rows[0].full_name, email: userRes.rows[0].email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
