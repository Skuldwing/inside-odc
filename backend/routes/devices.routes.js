const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const requireAdminPin = require("../middleware/pin.middleware");

const router = express.Router();

/* ===== GET ALL DEVICES ===== */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM devices ORDER BY name"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE DEVICE ===== */
router.post("/", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const {
      name,
      description = null,
      category = null,
      color = null,
      status = "active",
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nom requis" });
    }

    const result = await pool.query(
      `
      INSERT INTO devices (name, description, category, color, status)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [name, description, category, color, status]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE DEVICE ===== */
router.put("/:id", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description = null,
      category = null,
      color = null,
      status = "active",
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nom requis" });
    }

    const result = await pool.query(
      `
      UPDATE devices
      SET name = $1,
          description = $2,
          category = $3,
          color = $4,
          status = $5
      WHERE id = $6
      RETURNING *
      `,
      [name, description, category, color, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Dispositif introuvable" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE DEVICE ===== */
router.delete("/:id", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      "DELETE FROM devices WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Dispositif introuvable" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
