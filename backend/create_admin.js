const bcrypt = require("bcrypt");
const { Client } = require("pg");
require("dotenv").config();

async function run() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Definissez ADMIN_EMAIL et ADMIN_PASSWORD dans l'environnement.");
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const hash = await bcrypt.hash(password, 10);

  const result = await client.query(
    `INSERT INTO users (email, password, full_name, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, is_active = true
     RETURNING id`,
    [email, hash, "Administrateur", "admin", true]
  );

  if (result.rowCount > 0) {
    console.log("Utilisateur admin cree avec succes !");
  } else {
    console.log("L'utilisateur existe deja.");
  }
  console.log(`Administrateur configure : ${email}`);

  await client.end();
}

run().catch((e) => console.error("Erreur:", e.message));
