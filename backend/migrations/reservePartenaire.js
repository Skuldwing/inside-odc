const pool = require("../db");

/**
 * La reserve d'un partenaire : ce qu'il a realise au-dela de son objectif.
 *
 * Une seule chose est a stocker — la part du surplus qu'un administrateur a
 * liberee. Le surplus lui-meme ne se stocke pas : c'est une difference entre
 * deux nombres qu'on sait deja calculer, et la figer ferait mentir la fiche des
 * qu'une liste est corrigee. Voir « services/reservePartenaire.js ».
 *
 * Les trois autres colonnes disent qui a libere, et quand. Une activation
 * change les indicateurs du partenaire : il faut pouvoir repondre six mois plus
 * tard a « pourquoi ce chiffre a bouge ». Le journal d'audit le dit aussi, mais
 * il faut le chercher ; la fiche, elle, le montre.
 *
 * Neutre au demarrage : « reserve_activee » vaut zero partout, donc chaque
 * partenaire est plafonne a son objectif et rien n'est libere. Seul l'affichage
 * change — aucun compte n'est touche.
 */
async function ensureReservePartenaire() {
  await pool.query(`
    ALTER TABLE partners
      ADD COLUMN IF NOT EXISTS reserve_activee         INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS reserve_activee_le      TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reserve_activee_par     INTEGER,
      ADD COLUMN IF NOT EXISTS reserve_activee_par_nom TEXT
  `);

  /* Une reserve negative n'a pas de sens et retirerait du realise au
     partenaire. La route le refuse deja ; la base le refuse aussi, pour qu'une
     correction faite a la main en SQL ne puisse pas l'introduire. */
  await pool.query(`
    DO $$
    BEGIN
      ALTER TABLE partners
        ADD CONSTRAINT partners_reserve_activee_positive
        CHECK (reserve_activee >= 0);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `);
}

module.exports = { ensureReservePartenaire };
