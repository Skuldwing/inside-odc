const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

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
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      activity_date,
      duration_hours,
      location,
      device_id,
      partner_id,
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
      (title, description, activity_date, duration_hours, location, device_id, partner_id, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        title,
        description,
        activity_date,
        duration_hours || null,
        location,
        device_id,
        resolvedPartnerId,
        req.user.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
