const pool = require("../db");

/**
 * La contre-vérification : demander aux bénéficiaires eux-mêmes, et aller voir.
 *
 * verifications_beneficiaires
 *   Chaque mois, un échantillon tiré au hasard dans les listes de chaque
 *   partenaire reçoit un email : « Avez-vous participé à … ? Oui / Non ».
 *   Le jeton, imprévisible, est la seule clé de la page de réponse. Une
 *   personne n'est interrogée qu'une fois par campagne, sur une seule de ses
 *   activités.
 *
 * visites_inopinees
 *   Des activités à venir, tirées au hasard, où un agent ODC passe sans
 *   prévenir et note l'effectif qu'il constate — à comparer, ensuite, à la
 *   liste déclarée.
 *
 * Idempotente.
 */
async function ensureContreVerification() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verifications_beneficiaires (
      id              SERIAL PRIMARY KEY,
      jeton           TEXT NOT NULL UNIQUE,
      campagne        TEXT NOT NULL,
      participant_id  INTEGER REFERENCES participants(id) ON DELETE SET NULL,
      activity_id     INTEGER REFERENCES activities(id) ON DELETE CASCADE,
      partner_id      INTEGER,
      email           TEXT NOT NULL,
      cree_le         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cree_par        INTEGER,
      envoye_le       TIMESTAMPTZ,
      erreur_envoi    TEXT,
      reponse         TEXT CHECK (reponse IN ('oui', 'non')),
      repondu_le      TIMESTAMPTZ,
      commentaire     TEXT,
      UNIQUE (campagne, participant_id)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS verifications_beneficiaires_activite
      ON verifications_beneficiaires (activity_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visites_inopinees (
      id                 SERIAL PRIMARY KEY,
      activity_id        INTEGER NOT NULL UNIQUE REFERENCES activities(id) ON DELETE CASCADE,
      tiree_le           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      tiree_par          INTEGER,
      visite_le          DATE,
      visiteur           TEXT,
      effectif_constate  INTEGER CHECK (effectif_constate IS NULL OR effectif_constate >= 0),
      commentaire        TEXT
    )
  `);
}

let pret = null;
function contreVerificationPrete() {
  if (!pret) {
    pret = ensureContreVerification().catch((err) => {
      pret = null;
      throw err;
    });
  }
  return pret;
}

module.exports = { ensureContreVerification, contreVerificationPrete };
