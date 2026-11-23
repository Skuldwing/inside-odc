const pool = require("../db");

/**
 * D'où vient le genre d'une fiche.
 *
 * Plusieurs milliers de fiches n'ont pas de genre : la case n'a pas été cochée
 * sur la liste de présence, ou le formulaire ne la demandait pas. Le genre peut
 * souvent se déduire du prénom — mais une déduction n'est pas une déclaration,
 * et les deux ne doivent pas se confondre en base.
 *
 *  - NULL     : le genre a été déclaré, ou saisi par quelqu'un. C'est le cas de
 *               toutes les fiches existantes, et de toute correction à la main.
 *  - 'deduit' : il a été déduit du prénom, puis validé par un administrateur.
 *
 * Sans cette marque, une erreur de déduction deviendrait introuvable : on ne
 * saurait plus quelles fiches relisent, ni lesquelles retirer si la règle se
 * révèle mauvaise. Avec elle, tout se défait d'un geste, et un rapport peut
 * dire combien de ses chiffres reposent sur une déduction.
 *
 * Idempotente : la rejouer ne coûte rien.
 */
async function ensureGenreSource() {
  await pool.query(`ALTER TABLE participants ADD COLUMN IF NOT EXISTS genre_source TEXT`);
}

/* Les migrations de démarrage ne sont pas attendues avant « app.listen » : une
   requête peut arriver pendant que la colonne s'ajoute encore. Les routes qui
   s'en servent passent donc par ici, qui ne fait le travail qu'une fois par
   processus — et le refait si la première tentative a échoué, plutôt que de
   mémoriser un échec pour toute la vie du processus. */
let pret = null;
function genreSourcePret() {
  if (!pret) {
    pret = ensureGenreSource().catch((err) => {
      pret = null;
      throw err;
    });
  }
  return pret;
}

module.exports = { ensureGenreSource, genreSourcePret };
