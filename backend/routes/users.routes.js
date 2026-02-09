const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { sendEmail } = require("../services/mail");

const router = express.Router();
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || "ChangeMe123!";

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
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
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
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
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

    const pwd = password || DEFAULT_PASSWORD;
    const hash = await bcrypt.hash(pwd, 10);
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

    // Send welcome email (best-effort)
    try {
      const appUrl =
        process.env.APP_BASE_URL || "https://inside-odc.netlify.app";
      const subject = "Votre accès Inside ODC";
      const html = `
        <div>
          <p>Bonjour ${full_name || email},</p>
          <p>Votre compte a été créé.</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Mot de passe:</strong> ${pwd}</p>
          <p>Connectez-vous ici : <a href="${appUrl}/login">${appUrl}/login</a></p>
          <p>Veuillez changer votre mot de passe après connexion.</p>
        </div>
      `;
      const text =
        `Bonjour ${full_name || email}\n` +
        `Votre compte a été créé.\n` +
        `Email: ${email}\n` +
        `Mot de passe: ${pwd}\n` +
        `Connexion: ${appUrl}/login\n` +
        `Veuillez changer votre mot de passe après connexion.`;

      await sendEmail({
        toEmail: email,
        toName: full_name || email,
        subject,
        html,
        text,
      });
    } catch (err) {
      console.error("Erreur envoi email création utilisateur", err);
    }

    res.status(201).json(createdUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE USER ===== */
router.put("/:id", authMiddleware, requireAdmin, async (req, res) => {
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE (DEACTIVATE) USER ===== */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
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

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== RESET PASSWORD ===== */
router.post("/:id/reset-password", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const newPassword =
      req.body?.password || process.env.DEFAULT_USER_PASSWORD || "ChangeMe123!";

    const hash = await bcrypt.hash(newPassword, 10);
    const hasIsActive = await hasUsersIsActiveColumn();

    const result = await pool.query(
      `
      UPDATE users
      SET password = $1
      WHERE id = $2
      RETURNING id
      `,
      [hash, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    if (hasIsActive) {
      // If user was deactivated, reactivate on reset.
      await pool.query(
        `
        UPDATE users
        SET is_active = true
        WHERE id = $1
        `,
        [id]
      );
    }

    // Send reset email (best-effort)
    try {
      const userRes = await pool.query(
        "SELECT email, full_name FROM users WHERE id = $1",
        [id]
      );
      const user = userRes.rows[0];
      if (user?.email) {
        const appUrl =
          process.env.APP_BASE_URL || "https://inside-odc.netlify.app";
        const subject = "Votre mot de passe Inside ODC a été réinitialisé";
        const html = `
          <div>
            <p>Bonjour ${user.full_name || user.email},</p>
            <p>Votre mot de passe a été réinitialisé.</p>
            <p><strong>Nouveau mot de passe:</strong> ${newPassword}</p>
            <p>Connectez-vous ici : <a href="${appUrl}/login">${appUrl}/login</a></p>
            <p>Veuillez changer votre mot de passe après connexion.</p>
          </div>
        `;
        const text =
          `Bonjour ${user.full_name || user.email}\n` +
          `Votre mot de passe a été réinitialisé.\n` +
          `Nouveau mot de passe: ${newPassword}\n` +
          `Connexion: ${appUrl}/login\n` +
          `Veuillez changer votre mot de passe après connexion.`;

        await sendEmail({
          toEmail: user.email,
          toName: user.full_name || user.email,
          subject,
          html,
          text,
        });
      }
    } catch (err) {
      console.error("Erreur envoi email reset mot de passe", err);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
