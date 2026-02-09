const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

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

    res.status(201).json(result.rows[0]);
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

module.exports = router;
