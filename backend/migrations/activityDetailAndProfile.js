const pool = require("../db");

/**
 * Migration pour la vue détaillée d'activité et le profil participant.
 * Idempotente : peut être exécutée plusieurs fois sans risque.
 */
async function ensureActivityDetailAndProfileSchema() {
  try {
    await pool.query(`
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS form_id INTEGER REFERENCES forms(id) ON DELETE SET NULL;
      ALTER TABLE activities ADD COLUMN IF NOT EXISTS emargement_ferme_manuellement BOOLEAN DEFAULT FALSE;
      ALTER TABLE activity_participants ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT NOW();
      ALTER TABLE participants ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE participants ADD COLUMN IF NOT EXISTS interet_stage BOOLEAN DEFAULT FALSE;
    `);
    console.log("[MIGRATION] ensureActivityDetailAndProfileSchema: OK");
  } catch (err) {
    console.warn("[MIGRATION] ensureActivityDetailAndProfileSchema:", err.message);
  }
}

module.exports = { ensureActivityDetailAndProfileSchema };
