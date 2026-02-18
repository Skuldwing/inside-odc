const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

async function run() {
  const sqlPath = path.join(__dirname, "..", "migrations", "alter_schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

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
    await client.query(sql);
    console.log("Migration terminee.");
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
