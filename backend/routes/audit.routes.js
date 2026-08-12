const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

router.use(authMiddleware, requireAdmin);

/* ===== GET AUDIT LOGS ===== */
router.get("/", async (req, res) => {
  try {
    const {
      resource,
      action,
      user_id,
      from,
      to,
      search,
      limit = 100,
      offset = 0,
    } = req.query;

    const conditions = [];
    const params = [];

    if (resource) {
      params.push(resource);
      conditions.push(`resource = $${params.length}`);
    }
    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }
    if (user_id) {
      params.push(Number(user_id));
      conditions.push(`user_id = $${params.length}`);
    }
    if (from) {
      params.push(from);
      conditions.push(`created_at >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      conditions.push(`created_at < ($${params.length}::date + interval '1 day')`);
    }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      params.push(`%${search}%`);
      const n2 = params.length;
      conditions.push(`(resource_label ILIKE $${n} OR user_full_name ILIKE $${n2})`);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(Number(limit));
    params.push(Number(offset));
    const dataResult = await pool.query(
      `SELECT * FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total, rows: dataResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET DISTINCT USERS WHO APPEAR IN LOGS ===== */
router.get("/actors", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT user_id, user_full_name, user_role
       FROM audit_logs
       WHERE user_id IS NOT NULL
       ORDER BY user_full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET NOTIFICATIONS (non-admin actions since last seen) ===== */
router.get("/notifications", async (req, res) => {
  try {
    const userRes = await pool.query(
      "SELECT notifications_last_seen_at FROM users WHERE id = $1",
      [req.user.id]
    );
    const lastSeen = userRes.rows[0]?.notifications_last_seen_at ?? null;

    const params = [];
    const conditions = ["user_role != 'admin'"];

    // Si jamais vu : limiter aux 7 derniers jours pour ne pas surcharger
    const since = lastSeen ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    params.push(since);
    conditions.push(`created_at > $${params.length}`);

    const where = "WHERE " + conditions.join(" AND ");

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
      params
    );

    const itemsRes = await pool.query(
      `SELECT id, user_full_name, user_role, action, resource, resource_label, details, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC LIMIT 15`,
      params
    );

    res.json({ count: countRes.rows[0].total, items: itemsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MARK NOTIFICATIONS AS SEEN ===== */
router.post("/notifications/seen", async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET notifications_last_seen_at = NOW() WHERE id = $1",
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
