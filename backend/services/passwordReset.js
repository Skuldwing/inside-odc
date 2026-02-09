const crypto = require("crypto");
const pool = require("../db");

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createPasswordToken(userId, ttlHours = 24) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  await pool.query(
    `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE user_id = $1 AND used_at IS NULL
    `,
    [userId]
  );

  await pool.query(
    `
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)
    `,
    [userId, tokenHash, String(ttlHours)]
  );

  return token;
}

async function consumePasswordToken(token) {
  const tokenHash = hashToken(token);

  const res = await pool.query(
    `
    SELECT id, user_id
    FROM password_reset_tokens
    WHERE token_hash = $1
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );

  const row = res.rows[0];
  if (!row) return null;

  await pool.query(
    `
    UPDATE password_reset_tokens
    SET used_at = NOW()
    WHERE id = $1
    `,
    [row.id]
  );

  return row.user_id;
}

module.exports = { createPasswordToken, consumePasswordToken };
