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
      participants_manual,
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
      (title, description, activity_date, duration_hours, location, device_id, partner_id, created_by, participants_manual)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE ACTIVITY ===== */
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      activity_date,
      duration_hours,
      location,
      device_id,
      partner_id,
      participants_manual,
    } = req.body;

    if (!title || !activity_date) {
      return res.status(400).json({ error: "Titre et date requis" });
    }

    const existing = await pool.query(
      "SELECT id, partner_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (
      req.user.role === "partner" &&
      existing.rows[0].partner_id !== req.user.partner_id
    ) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const resolvedPartnerId =
      req.user.role === "partner" ? req.user.partner_id : partner_id || null;

    const result = await pool.query(
      `
      UPDATE activities
      SET title = $1,
          description = $2,
          activity_date = $3,
          duration_hours = $4,
          location = $5,
          device_id = $6,
          partner_id = $7,
          participants_manual = $8
      WHERE id = $9
      RETURNING *
      `,
      [
        title,
        description || null,
        activity_date,
        duration_hours || null,
        location || null,
        device_id || null,
        resolvedPartnerId,
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== EXPORT LISTE PRESENCES PAR ACTIVITE ===== */
router.get("/:id/participants/export", authMiddleware, async (req, res) => {
  try {
    const XLSX = require("xlsx");
    const { id } = req.params;

    const actRes = await pool.query(
      `SELECT a.title, a.activity_date, p.name AS partner_name
       FROM activities a LEFT JOIN partners p ON p.id = a.partner_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activite introuvable" });

    const activity = actRes.rows[0];

    const partRes = await pool.query(
      `SELECT p.prenom, p.nom, p.telephone, p.email, p.genre, p.age_range, p.structure
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       WHERE ap.activity_id = $1
       ORDER BY p.nom, p.prenom`,
      [id]
    );

    const rows = partRes.rows.map((p) => ({
      "Prenom": p.prenom || "",
      "Nom": p.nom || "",
      "Telephone": p.telephone || "",
      "Email": p.email || "",
      "Genre": p.genre === "F" ? "Femme" : p.genre === "H" ? "Homme" : p.genre || "",
      "Tranche d'age": p.age_range || "",
      "Structure / Etablissement": p.structure || "",
    }));

    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0
        ? rows
        : [{ "Prenom": "", "Nom": "", "Telephone": "", "Email": "", "Genre": "", "Tranche d'age": "", "Structure / Etablissement": "" }]
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presences");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeName = activity.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const filename = `presences_${safeName}_${activity.activity_date}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE ACTIVITY ===== */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      "SELECT id, partner_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (
      req.user.role === "partner" &&
      existing.rows[0].partner_id !== req.user.partner_id
    ) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const result = await pool.query(
      "DELETE FROM activities WHERE id = $1 RETURNING id",
      [id]
    );

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
