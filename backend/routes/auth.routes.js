const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { consumePasswordToken } = require("../services/passwordReset");

const router = express.Router();

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email et mot de passe requis" });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Utilisateur introuvable" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Mot de passe incorrect" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        partner_id: user.partner_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        partner_id: user.partner_id,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

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

/* ================= SET PASSWORD ================= */
router.post("/set-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password || String(password).length < 6) {
      return res
        .status(400)
        .json({ error: "Token et mot de passe valides requis" });
    }

    const userId = await consumePasswordToken(token);
    if (!userId) {
      return res.status(400).json({ error: "Token invalide ou expiré" });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `
      UPDATE users
      SET password = $1
      WHERE id = $2
      `,
      [hash, userId]
    );

    if (await hasUsersIsActiveColumn()) {
      await pool.query(
        `
        UPDATE users
        SET is_active = true
        WHERE id = $1
        `,
        [userId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;





