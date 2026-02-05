const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config();

async function run() {
  const sqlPath = path.join(__dirname, "..", "migrations", "alter_schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
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
