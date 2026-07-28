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

module.exports = router;
