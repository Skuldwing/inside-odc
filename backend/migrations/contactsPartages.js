const pool = require("../db");

/**
 * Une adresse ou un numero peut figurer sur plusieurs fiches.
 *
 * Deux index d'unicite interdisaient qu'une meme adresse, ou un meme numero,
 * apparaisse sur deux participants. L'intention etait d'empecher les doublons.
 * L'effet etait autre : la plateforme devait choisir a qui appartenait un
 * contact, et refusait de l'enregistrer pour les autres.
 *
 * Or c'est un cas courant, et pas une erreur :
 *
 *   — la meme personne revient sur plusieurs listes de presence, ecrite
 *     differemment a chaque fois. La plateforme y voit plusieurs personnes,
 *     et n'en laisse qu'une garder ses coordonnees ;
 *   — un numero de famille sert a inscrire un frere et une soeur ;
 *   — une adresse de service inscrit plusieurs collegues.
 *
 * Dans les trois cas, l'index faisait disparaitre une information que la
 * liste portait. Une feuille de presence n'a pas a etre amputee parce que le
 * schema a un avis sur l'identite des gens.
 *
 * Les doublons de personnes se traitent donc ou ils doivent l'etre : par le
 * rapprochement a l'import, et par l'ecran qui propose de reunir les fiches
 * d'une meme personne — ou l'utilisateur tranche, et ou rien n'est
 * automatique. La base, elle, enregistre ce qu'on lui donne.
 *
 * Les index sont remplaces par leurs equivalents non uniques : les
 * recherches par adresse et par numero restent aussi rapides.
 */
async function ensureContactsPartages() {
  await pool.query(`DROP INDEX IF EXISTS participants_email_unique`);
  await pool.query(`DROP INDEX IF EXISTS participants_telephone_unique`);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_participants_email
       ON participants (lower(email)) WHERE email IS NOT NULL`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_participants_telephone
       ON participants (telephone) WHERE telephone IS NOT NULL`
  );
}

module.exports = { ensureContactsPartages };
