const pool = require("../db");

/**
 * Checklist d'une activite : ses taches, a qui elles sont confiees et leur
 * avancement. Idempotente : rejouable sans risque au demarrage.
 */
async function ensureActivityTasksSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_tasks (
      id            SERIAL PRIMARY KEY,
      activity_id   INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      description   TEXT,
      status        TEXT DEFAULT 'a_faire' CHECK (status IN ('a_faire','en_cours','termine')),
      assigned_to   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      due_date      DATE,
      position      INTEGER DEFAULT 0,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      completed_at  TIMESTAMPTZ
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_activity_tasks_activity ON activity_tasks(activity_id)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_activity_tasks_assigned ON activity_tasks(assigned_to)`
  );
  /* Colonne pour le nom personnalisé de l'export de liste (Excel). */
  await pool.query(
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS list_export_name TEXT`
  );
}

module.exports = { ensureActivityTasksSchema };
