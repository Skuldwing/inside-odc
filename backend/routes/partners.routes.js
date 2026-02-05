const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

/* ===== GET ALL PARTNERS ===== */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM partners ORDER BY name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE PARTNER ===== */
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description = null,
      contact_email = null,
      contact_phone = null,
      objective_beneficiaries = 0,
      status = "active",
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nom requis" });
    }

    const result = await pool.query(
      `
      INSERT INTO partners
      (name, description, contact_email, contact_phone, objective_beneficiaries, status)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        name,
        description,
        contact_email,
        contact_phone,
        objective_beneficiaries,
        status,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE PARTNER ===== */
router.put("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description = null,
      contact_email = null,
      contact_phone = null,
      objective_beneficiaries = 0,
      status = "active",
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nom requis" });
    }

    const result = await pool.query(
      `
      UPDATE partners
      SET name = $1,
          description = $2,
          contact_email = $3,
          contact_phone = $4,
          objective_beneficiaries = $5,
          status = $6
      WHERE id = $7
      RETURNING *
      `,
      [
        name,
        description,
        contact_email,
        contact_phone,
        objective_beneficiaries,
        status,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Partenaire introuvable" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE PARTNER ===== */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM partners WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Partenaire introuvable" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
