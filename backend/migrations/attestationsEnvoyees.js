const pool = require("../db");

/**
 * Qui a deja recu son attestation, pour quelle activite.
 *
 * L'envoi ne gardait aucune trace. Rien n'empechait de relancer l'envoi sur
 * une activite et d'expedier une seconde fois le meme document aux memes
 * personnes — ce qui est au mieux desagreable pour elles, au pire pris pour du
 * spam par leur messagerie, et compte contre la reputation du compte
 * d'expedition.
 *
 * Une ligne par (activite, participant) : la cle primaire suffit a garantir
 * qu'une attestation ne part qu'une fois. On retient aussi l'intitule du
 * module et l'adresse utilisee, pour pouvoir repondre a « qu'est-ce qu'elle a
 * recu, et ou ? » sans avoir a le deduire.
 */
async function ensureAttestationsEnvoyees() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attestations_envoyees (
      activity_id    INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      email          TEXT,
      module         TEXT,
      envoye_le      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (activity_id, participant_id)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_attestations_envoyees_activite
       ON attestations_envoyees (activity_id)`
  );
}

module.exports = { ensureAttestationsEnvoyees };
