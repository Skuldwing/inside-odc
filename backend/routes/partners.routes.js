const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const requireAdminPin = require("../middleware/pin.middleware");
const { logAudit } = require("../services/audit");

const router = express.Router();

/* ===== GET ALL PARTNERS ===== */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.*,
        COUNT(DISTINCT a.id)::int AS activities_count,
        COUNT(ap.participant_id)::int AS beneficiaries_count,
        COALESCE((
          SELECT SUM(u.objective_beneficiaries)
          FROM users u
          WHERE u.partner_id = p.id AND u.role = 'coach' AND u.objective_beneficiaries IS NOT NULL
        ), 0)::int AS coaches_objective_allocated,
        (
          SELECT COUNT(*)
          FROM users u
          WHERE u.partner_id = p.id AND u.role = 'coach'
        )::int AS coaches_count
      FROM partners p
      LEFT JOIN activities a ON a.partner_id = p.id
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      GROUP BY p.id
      ORDER BY p.name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE PARTNER ===== */
router.post("/", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
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

    const created = result.rows[0];
    logAudit(req, "CREATE", "partners", created.id, created.name, { status: created.status });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE PARTNER ===== */
router.put("/:id", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
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

    const updated = result.rows[0];
    logAudit(req, "UPDATE", "partners", updated.id, updated.name, { status: updated.status });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET PARTNER DEVICES ===== */
router.get("/:id/devices", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT device_id FROM partner_devices WHERE partner_id = $1",
      [req.params.id]
    );
    res.json(result.rows.map((r) => r.device_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SET PARTNER DEVICES ===== */
router.put("/:id/devices", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { device_ids = [] } = req.body;
    const { id } = req.params;

    await pool.query("DELETE FROM partner_devices WHERE partner_id = $1", [id]);

    if (device_ids.length > 0) {
      const values = device_ids
        .map((_, i) => `($1, $${i + 2})`)
        .join(", ");
      await pool.query(
        `INSERT INTO partner_devices (partner_id, device_id) VALUES ${values}`,
        [id, ...device_ids]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE PARTNER ===== */
router.delete("/:id", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await pool.query("SELECT name FROM partners WHERE id = $1", [id]);
    const result = await pool.query(
      "DELETE FROM partners WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Partenaire introuvable" });
    }

    logAudit(req, "DELETE", "partners", id, before.rows[0]?.name ?? null, {});
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
