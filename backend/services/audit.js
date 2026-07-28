const pool = require("../db");

async function logAudit(req, action, resource, resourceId, resourceLabel, details = {}) {
  try {
    const userId = req.user?.id ?? null;
    const userRole = req.user?.role ?? null;
    const ip = ((req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]).trim() || null;

    let userFullName = null;
    if (userId) {
      const r = await pool.query("SELECT full_name FROM users WHERE id = $1", [userId]);
      userFullName = r.rows[0]?.full_name ?? null;
    }

    await pool.query(
      `INSERT INTO audit_logs
         (user_id, user_full_name, user_role, action, resource, resource_id, resource_label, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        userId,
        userFullName,
        userRole,
        action,
        resource,
        resourceId != null ? String(resourceId) : null,
        resourceLabel ?? null,
        JSON.stringify(details),
        ip,
      ]
    );
  } catch (err) {
    console.warn("Audit log error:", err.message);
  }
}

module.exports = { logAudit };
