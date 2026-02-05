const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

/* ===== GET ALL PARTICIPANTS ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT p.*,
             a.title AS activite,
             a.activity_date AS date_activite,
             pr.name AS partenaire,
             d.name AS dispositif
      FROM participants p
      LEFT JOIN activity_participants ap ON ap.participant_id = p.id
      LEFT JOIN activities a ON ap.activity_id = a.id
      LEFT JOIN partners pr ON a.partner_id = pr.id
      LEFT JOIN devices d ON a.device_id = d.id
    `;
    const params = [];

    if (req.user.role === "partner") {
      query += " WHERE a.partner_id = $1";
      params.push(req.user.partner_id);
    }

    query += " ORDER BY p.created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
