const pool = require("../db");

/**
 * Les réalisations d'un compte devenu coach.
 *
 * Un compte d'abord créé comme partenaire, puis passé coach, laisse derrière
 * lui les activités qu'il a déclarées : elles portent le partenaire d'alors et
 * aucun coach. Il ne les voit plus, et elles ne comptent pas dans « par ses
 * coachs » chez son partenaire actuel. Le rattachement les lui rend : coach
 * renseigné, partenaire retiré de l'activité — c'est alors son compte qui
 * porte le partenaire, comme pour toute activité de coach.
 *
 * Chaque activité déplacée est notée ici avec le partenaire qu'elle portait,
 * pour que l'opération se défasse exactement.
 *
 * Idempotente.
 */
async function ensureRattachementCoach() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rattachements_coach (
      id              SERIAL PRIMARY KEY,
      coach_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      activity_id     INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
      partner_id_avant INTEGER,
      fait_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fait_par        INTEGER
    )
  `);
}

let pret = null;
function rattachementCoachPret() {
  if (!pret) {
    pret = ensureRattachementCoach().catch((err) => {
      pret = null;
      throw err;
    });
  }
  return pret;
}

module.exports = { ensureRattachementCoach, rattachementCoachPret };
