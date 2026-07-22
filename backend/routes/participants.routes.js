const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

/* ===== GET ALL PARTICIPANTS ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT
        p.*,
        a.id        AS activity_id,
        a.title     AS activite,
        a.activity_date AS date_activite,
        pr.name     AS partenaire,
        d.name      AS dispositif
      FROM participants p
      JOIN activity_participants ap ON ap.participant_id = p.id
      JOIN activities a ON a.id = ap.activity_id
      LEFT JOIN partners pr ON pr.id = a.partner_id
      LEFT JOIN devices  d  ON d.id  = a.device_id
    `;
    const params = [];

    if (req.user.role === "partner") {
      query += " WHERE a.partner_id = $1";
      params.push(req.user.partner_id);
    }

    query += " ORDER BY a.activity_date DESC, p.nom, p.prenom";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
