const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const requireAdminPin = require("../middleware/pin.middleware");
const { logAudit } = require("../services/audit");
const { ensureCoachDevicesSchema, tableAbsente } = require("../migrations/coachDevices");

const router = express.Router();

/* ===== GET DEVICES ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query, params = [];

    /* Un coach recevait une liste vide : il ne pouvait donc rattacher aucune
       activite a un dispositif. Il voit desormais ceux qui lui sont confies. */
    if (req.user.role === "coach") {
      query = `
        SELECT d.*,
               COUNT(DISTINCT a.id)::int AS activities_count,
               COUNT(ap.participant_id)::int AS beneficiaries_count
        FROM devices d
        JOIN user_devices ud ON ud.device_id = d.id
        LEFT JOIN activities a ON a.device_id = d.id
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        WHERE ud.user_id = $1
        GROUP BY d.id
        ORDER BY d.name
      `;
      params = [req.user.id];
    } else if (req.user.role === "partner") {
      query = `
        SELECT d.*,
               COUNT(DISTINCT a.id)::int AS activities_count,
               COUNT(ap.participant_id)::int AS beneficiaries_count
        FROM devices d
        JOIN partner_devices pd ON pd.device_id = d.id
        LEFT JOIN activities a ON a.device_id = d.id
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        WHERE pd.partner_id = $1
        GROUP BY d.id
        ORDER BY d.name
      `;
      params = [req.user.partner_id];
    } else {
      query = `
        SELECT d.*,
               COUNT(DISTINCT a.id)::int AS activities_count,
               COUNT(ap.participant_id)::int AS beneficiaries_count
        FROM devices d
        LEFT JOIN activities a ON a.device_id = d.id
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        GROUP BY d.id
        ORDER BY d.name
      `;
    }

    let result;
    try {
      result = await pool.query(query, params);
    } catch (err) {
      /* La table des dispositifs confies peut manquer si la migration de
         demarrage n'est pas passee : on la cree et on reessaie une fois. */
      if (!tableAbsente(err)) throw err;
      await ensureCoachDevicesSchema();
      result = await pool.query(query, params);
    }
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

    const created = result.rows[0];
    logAudit(req, "CREATE", "devices", created.id, created.name, { category: created.category });
    res.status(201).json(created);
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

    const updated = result.rows[0];
    logAudit(req, "UPDATE", "devices", updated.id, updated.name, { category: updated.category, status: updated.status });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE DEVICE ===== */
router.delete("/:id", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await pool.query("SELECT name FROM devices WHERE id = $1", [id]);
    const result = await pool.query(
      "DELETE FROM devices WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Dispositif introuvable" });
    }

    logAudit(req, "DELETE", "devices", id, before.rows[0]?.name ?? null, {});
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
