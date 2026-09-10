const pool = require("../db");

/**
 * Schema du profil utilisateur.
 *
 * Isole ici plutot que noye dans index.js pour une raison precise : les
 * migrations de demarrage sont lancees sans etre attendues et n'echouent
 * qu'en console.warn. Si l'une d'elles ne passe pas — verrou sur la table,
 * redemarrage interrompu, droits — l'application demarre normalement et la
 * page Profil renvoie une erreur serveur a chaque appel, sans que rien ne
 * signale pourquoi. La route peut donc rappeler cette fonction elle-meme
 * quand elle constate que les colonnes manquent.
 *
 * Toutes les instructions sont idempotentes : la rejouer ne coute rien.
 */
async function ensureProfileSchema() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ`);

  /* L'image vit dans sa propre table, pas en colonne de users : plusieurs
     requetes font « SELECT * FROM users » — la connexion, notamment — et
     embarqueraient la photo a chaque appel. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_avatars (
      user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mime       TEXT NOT NULL,
      data       BYTEA NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/* 42703 : colonne inconnue. 42P01 : table inconnue. Ce sont les deux seules
   erreurs que l'absence de migration peut produire ici ; tout autre code est
   un vrai probleme et doit remonter tel quel. */
function estSchemaManquant(err) {
  return err && (err.code === "42703" || err.code === "42P01");
}

module.exports = { ensureProfileSchema, estSchemaManquant };
