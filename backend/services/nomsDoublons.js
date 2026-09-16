/**
 * Nom de famille ecrit deux fois.
 *
 * Sur les feuilles de presence, beaucoup de gens ecrivent leur nom entier dans
 * la case « Prenom ». La colonne prenom vaut alors « Rockaya Samb » et la
 * colonne nom « Samb » : l'attestation, qui compose prenom + nom, imprime
 * « Rockaya Samb Samb ».
 *
 * L'import n'y est pour rien — il recopie ce qu'il lit, et rien ne permet de
 * deviner l'intention a la lecture : « Marie Claire » est un prenom compose
 * parfaitement legitime. La repetition, elle, se reconnait apres coup.
 *
 * Ce module est la reference unique de cette detection : l'import la signale,
 * la correction retroactive s'en sert, et l'interface affiche le meme verdict.
 */

function normaliser(v) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Renvoie le prenom debarrasse du nom repete, ou null s'il n'y a rien a
 * corriger. La repetition se trouve en fin de prenom (« Rockaya Samb ») comme
 * en tete (« Niang Khadidiatou »), selon l'ordre dans lequel la personne a
 * ecrit. Un prenom d'un seul mot n'est jamais touche : « Diop » avec le nom
 * « Diop » reste tel quel, on ne laisserait rien derriere.
 */
function prenomSansNomRepete(prenom, nom) {
  const n = normaliser(nom);
  const mots = String(prenom || "").trim().split(/\s+/).filter(Boolean);
  if (!n || mots.length < 2) return null;
  if (normaliser(mots[mots.length - 1]) === n) return mots.slice(0, -1).join(" ");
  if (normaliser(mots[0]) === n) return mots.slice(1).join(" ");
  return null;
}

/* Sur une liste de lignes { nom, prenom }, ce qui serait a corriger. */
function repetitionsDans(lignes) {
  return (lignes || [])
    .map((l) => ({ ligne: l, propose: prenomSansNomRepete(l.prenom, l.nom) }))
    .filter((x) => x.propose !== null);
}

/**
 * La forme sous laquelle deux ecritures d'un meme nom se reconnaissent :
 * sans accent, sans casse, sans espaces superflus, et debarrassee du nom de
 * famille repete. « Samb / Rockaya Samb » et « Samb / Rockaya » donnent la
 * meme cle, donc la meme personne.
 *
 * Renvoie null si le nom ou le prenom manque : on ne rapproche pas deux
 * fiches sur du vide.
 */
function clePersonne(nom, prenom) {
  const aplatir = (v) => normaliser(v).replace(/[^a-z0-9]+/g, " ").trim();
  const p = prenomSansNomRepete(prenom, nom) ?? prenom;
  const cleNom = aplatir(nom);
  const clePrenom = aplatir(p);
  if (!cleNom || !clePrenom) return null;
  return `${cleNom}|${clePrenom}`;
}

function memePersonne(a, b) {
  const ca = clePersonne(a?.nom, a?.prenom);
  const cb = clePersonne(b?.nom, b?.prenom);
  return Boolean(ca && cb && ca === cb);
}

module.exports = {
  prenomSansNomRepete,
  repetitionsDans,
  normaliser,
  clePersonne,
  memePersonne,
};
