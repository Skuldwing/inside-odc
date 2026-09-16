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
 * Les mots qui composent une identite, sans accent, sans casse, sans
 * ponctuation, et sans repetition.
 */
function motsDuNom(nom, prenom) {
  return new Set(
    normaliser(`${nom || ""} ${prenom || ""}`)
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * La forme sous laquelle deux ecritures d'un meme nom se reconnaissent.
 *
 * C'est l'ensemble des mots de l'identite, trie. L'ordre ne compte donc pas :
 * sur les feuilles de presence, la meme personne signe « Mouhamed Abdoul
 * Fall » un jour et « Abdoul Mouhamed FALL » le lendemain, et les colonnes
 * « Nom » et « Prenom » sont remplies dans un sens ou dans l'autre selon qui
 * tient la feuille. Les traiter comme deux personnes faisait refuser a la
 * seconde l'adresse « deja attribuee » a la premiere, et creait une fiche sans
 * contact — c'est exactement ce qui s'observait a l'import.
 *
 * L'ensemble absorbe aussi le nom de famille recopie dans la case « Prenom » :
 * « Samb / Rockaya Samb » et « Samb / Rockaya » donnent les memes deux mots.
 *
 * Renvoie null si le nom ou le prenom manque : on ne rapproche pas deux fiches
 * sur du vide.
 */
function clePersonne(nom, prenom) {
  const aplatir = (v) => normaliser(v).replace(/[^a-z0-9]+/g, " ").trim();
  if (!aplatir(nom) || !aplatir(prenom)) return null;
  const mots = [...motsDuNom(nom, prenom)].sort();
  return mots.length ? mots.join(" ") : null;
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
  motsDuNom,
  clePersonne,
  memePersonne,
};
