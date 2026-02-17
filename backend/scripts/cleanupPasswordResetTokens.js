const { Client } = require("pg");
require("dotenv").config();

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
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
