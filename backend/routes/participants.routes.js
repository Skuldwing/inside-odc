const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

const PAGE_SIZE = 100;

/* ===== GET PARTICIPANTS (paginé, filtré côté serveur) ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const search = (req.query.search || "").trim();
    const genre  = req.query.genre || "";
    const offset = (page - 1) * PAGE_SIZE;

    const conditions = [];
    const params     = [];
    let idx = 1;

    if (req.user.role === "partner") {
      conditions.push(`a.partner_id = $${idx++}`);
      params.push(req.user.partner_id);
    } else if (req.user.role === "coach") {
      conditions.push(`a.coach_id = $${idx++}`);
      params.push(req.user.id);
    }

    if (genre) {
      conditions.push(`p.genre = $${idx++}`);
      params.push(genre);
    }

    if (search) {
      conditions.push(`(
        p.nom       ILIKE $${idx} OR p.prenom    ILIKE $${idx} OR
        p.structure ILIKE $${idx} OR a.title     ILIKE $${idx} OR
        pr.name     ILIKE $${idx} OR d.name      ILIKE $${idx}
      )`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const baseFrom = `
      FROM participants p
      JOIN activity_participants ap ON ap.participant_id = p.id
      JOIN activities a ON a.id = ap.activity_id
      LEFT JOIN partners pr ON pr.id = a.partner_id
      LEFT JOIN devices   d  ON d.id  = a.device_id
      ${where}
    `;

    const [statsRes, dataRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                     AS total,
          COUNT(*) FILTER (WHERE p.genre = 'H')::int       AS male,
          COUNT(*) FILTER (WHERE p.genre = 'F')::int       AS female
        ${baseFrom}
      `, params),
      pool.query(`
        SELECT
          p.*,
          a.id            AS activity_id,
          a.title         AS activite,
          a.activity_date AS date_activite,
          pr.name         AS partenaire,
          d.name          AS dispositif
        ${baseFrom}
        ORDER BY a.activity_date DESC, p.nom, p.prenom
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...params, PAGE_SIZE, offset]),
    ]);

    const { total, male, female } = statsRes.rows[0];
    res.json({
      rows:  dataRes.rows,
      total,
      male,
      female,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      limit: PAGE_SIZE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
