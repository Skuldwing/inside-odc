const pool = require("../db");

/**
 * L'espace des beneficiaires, et les liens qui y donnent acces.
 *
 * Un beneficiaire n'a pas de compte. Il existe comme une ligne de
 * « participants », parfois plusieurs, nee d'une liste de presence importee.
 * Lui demander un mot de passe supposerait de lui en creer un, donc de lui
 * ecrire pour le lui faire choisir — autant lui envoyer directement le lien
 * qui ouvre son espace.
 *
 * On ne stocke donc pas de compte, seulement des liens : un jeton a usage
 * unique, de courte duree, envoye a une adresse qui figure deja dans les
 * listes. C'est l'adresse qui fait foi, et elle n'est jamais creee ici.
 *
 * Le jeton n'est pas conserve en clair. Seule son empreinte l'est, comme pour
 * les mots de passe : une fuite de cette table ne donnerait acces a rien.
 */
async function ensureEspaceBeneficiaire() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS espace_liens (
      id          SERIAL PRIMARY KEY,
      email       TEXT NOT NULL,
      jeton_hash  TEXT NOT NULL UNIQUE,
      cree_le     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expire_le   TIMESTAMPTZ NOT NULL,
      utilise_le  TIMESTAMPTZ,
      ip          TEXT
    )
  `);

  /* Deux lectures : retrouver un jeton presente, et compter les demandes
     recentes d'une adresse pour ne pas laisser inonder une boite. */
  await pool.query(
    "CREATE INDEX IF NOT EXISTS espace_liens_jeton_idx ON espace_liens (jeton_hash)"
  );
  await pool.query(
    "CREATE INDEX IF NOT EXISTS espace_liens_email_idx ON espace_liens (email, cree_le DESC)"
  );

  /* Les liens perimes ne servent plus a rien et portent une adresse : on ne
     les garde pas indefiniment. Le menage se fait au demarrage, c'est assez
     pour une table qui grossit de quelques lignes par jour. */
  await pool.query(
    "DELETE FROM espace_liens WHERE expire_le < NOW() - INTERVAL '30 days'"
  );
}

module.exports = { ensureEspaceBeneficiaire };
