const pool = require("../db");

/**
 * Dispositifs confies a un coach / formateur.
 *
 * Sans cette table, un coach n'avait aucun dispositif rattache — et les routes
 * d'activite forcaient device_id a NULL pour lui. Ses seances n'apparaissaient
 * donc dans aucune repartition par dispositif, alors que ce sont precisement
 * elles qui remplissent les dispositifs.
 *
 * Meme forme que partner_devices, qui joue ce role pour les partenaires.
 * Idempotente : la rejouer ne coute rien.
 */
async function ensureCoachDevicesSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_devices (
      user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, device_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id)`
  );
}

/* 42P01 : table inconnue. Les migrations de demarrage ne sont pas attendues et
   n'echouent qu'en journal ; les routes concernees savent donc rejouer la
   creation plutot que de renvoyer une erreur serveur indefiniment. */
function tableAbsente(err) {
  return err && err.code === "42P01";
}

module.exports = { ensureCoachDevicesSchema, tableAbsente };
