const { Client } = require("pg");
require("dotenv").config();

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || "";
  const sslEnabled =
    String(process.env.DB_SSL || "").toLowerCase() === "true" ||
    /neon\.tech/i.test(dbUrl) ||
    process.env.NODE_ENV === "production";

  const client = new Client({
    connectionString: dbUrl,
    ssl: sslEnabled
      ? {
          rejectUnauthorized:
            String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "false") ===
            "true",
        }
      : false,
  });

  try {
    await client.connect();

    const result = await client.query(
      `
      DELETE FROM password_reset_tokens
      WHERE expires_at < NOW()
         OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '7 days')
      `
    );

    console.log(`Deleted ${result.rowCount} password reset token(s).`);
  } catch (err) {
    console.error("Cleanup error:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
