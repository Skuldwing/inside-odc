const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const pool = require("../db");

const router = express.Router();

/* ===== GET CAMPAGNES ===== */
router.get("/", authMiddleware, requireAdmin, (req, res) => {
  try {
    pool
      .query("SELECT * FROM campagnes ORDER BY created_at DESC")
      .then(result => res.json(result.rows))
      .catch(err => {
        console.error(err);
        res.status(500).json({ error: "Erreur serveur" });
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE CAMPAGNE ===== */
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, type = "email", message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ error: "Nom et message requis" });
    }

    const result = await pool.query(
      `
      INSERT INTO campagnes (name, type, message, status, created_at)
      VALUES ($1,$2,$3,$4, NOW())
      RETURNING *
      `,
      [name, type, message, "programmee"]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE CAMPAGNE ===== */
router.put("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type = "email", message, status = "programmee" } = req.body;

    if (!name || !message) {
      return res.status(400).json({ error: "Nom et message requis" });
    }

    const result = await pool.query(
      `
      UPDATE campagnes
      SET name = $1,
          type = $2,
          message = $3,
          status = $4
      WHERE id = $5
      RETURNING *
      `,
      [name, type, message, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE CAMPAGNE ===== */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM campagnes WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Campagne introuvable" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
