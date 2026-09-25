const pool = require("../db");

/**
 * « Ces deux fiches ne sont pas la meme personne. »
 *
 * La plateforme propose des rapprochements ; elle ne les impose pas quand le
 * nom seul les soutient. Restait a pouvoir dire non — et a ce que le non
 * tienne. Sans cela le groupe revenait a chaque visite, et une revue de six
 * cents decisions ne se terminait jamais : on retranchait indefiniment les
 * memes cas.
 *
 * On enregistre donc des paires : deux fiches dont quelqu'un a constate, en
 * les regardant, qu'elles designent deux personnes. C'est une decision
 * humaine, datee et signee, pas une deduction.
 *
 * Une paire plutot qu'un groupe : les groupes se recalculent a chaque
 * affichage, leur composition change des qu'une fiche arrive ou s'en va, et
 * une decision attachee a un groupe ne survivrait pas au suivant. Deux
 * identifiants de fiche, eux, ne bougent pas.
 *
 * Rien n'est supprime ici non plus : se tromper se defait en retirant la
 * paire.
 */
async function ensureIdentitesDistinctes() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS identites_distinctes (
      fiche_a        INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      fiche_b        INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      decide_par     INTEGER,
      decide_par_nom TEXT,
      decide_le      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (fiche_a, fiche_b),
      /* La paire est rangee dans un ordre fixe : sans cela (7, 9) et (9, 7)
         seraient deux lignes differentes pour la meme decision. */
      CONSTRAINT identites_distinctes_ordre CHECK (fiche_a < fiche_b)
    )
  `);

  /* On interroge par l'une ou l'autre fiche. */
  await pool.query(
    "CREATE INDEX IF NOT EXISTS identites_distinctes_b_idx ON identites_distinctes (fiche_b)"
  );
}

/** Range une paire dans l'ordre attendu par la table. */
const paireOrdonnee = (a, b) => (a < b ? [a, b] : [b, a]);

module.exports = { ensureIdentitesDistinctes, paireOrdonnee };
