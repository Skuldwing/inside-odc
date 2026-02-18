const { Pool } = require("pg");
require("dotenv").config();

const dbUrl = process.env.DATABASE_URL || "";
const sslEnabled =
  String(process.env.DB_SSL || "").toLowerCase() === "true" ||
  /neon\.tech/i.test(dbUrl) ||
  process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: dbUrl,
  ssl: sslEnabled
    ? {
        rejectUnauthorized:
          String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "false") === "true",
      }
    : false,
});

module.exports = pool;
