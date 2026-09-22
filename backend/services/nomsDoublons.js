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
 * L'apostrophe ne separe pas deux mots.
 *
 * « N'Diaye » et « Ndiaye » sont le meme nom, ecrit par deux mains
 * differentes — de meme « M'Baye » et « Mbaye », « N'Dour » et « Ndour ».
 * Traitee comme une ponctuation ordinaire, elle donnait les deux mots « n » et
 * « diaye » d'un cote, le seul mot « ndiaye » de l'autre : deux identites
 * differentes, donc deux fiches pour une personne. C'est l'un des doublons
 * qu'on retrouvait sur une meme liste de presence.
 *
 * Le trait d'union, lui, separe bel et bien : « Marie-Claire » et
 * « Marie Claire » doivent donner les deux memes mots.
 */
const APOSTROPHES = /['‘’ʼ`´]/g;

/* Les mots d'une valeur, sans accent, sans casse, sans ponctuation. */
function motsDe(valeur) {
  return normaliser(valeur)
    .replace(APOSTROPHES, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * La forme compacte d'un nom : ses lettres et ses chiffres, rien d'autre.
 * Elle sert a chercher en base sans se faire arreter par un accent ou une
 * apostrophe.
 */
function compacterNom(valeur) {
  return motsDe(valeur).join("");
}

/**
 * Les mots qui composent une identite, sans accent, sans casse, sans
 * ponctuation, et sans repetition.
 */
function motsDuNom(nom, prenom) {
  return new Set([...motsDe(nom), ...motsDe(prenom)]);
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
  if (!motsDe(nom).length || !motsDe(prenom).length) return null;
  const mots = [...motsDuNom(nom, prenom)].sort();
  return mots.length ? mots.join(" ") : null;
}

/**
 * La meme cle, mais sans exiger les deux parties du nom.
 *
 * Beaucoup de listes de presence n'ont qu'une colonne de nom, ou la laissent a
 * moitie vide. « Diop » sans prenom, deux fois sur la meme feuille, ne portait
 * aucune cle : l'import ne pouvait pas voir que c'etait deux fois la meme
 * ligne, et creait deux fiches. Cette cle-la les reconnait.
 *
 * Elle est moins sure que clePersonne — deux « Diop » sans prenom peuvent etre
 * deux personnes — et ne s'emploie donc que sur des lignes qu'aucune adresse ni
 * aucun numero different ne separe.
 */
function cleApprochee(nom, prenom) {
  const mots = [...motsDuNom(nom, prenom)].sort();
  return mots.length ? mots.join(" ") : null;
}

/**
 * Deux ecritures d'un nom qui peuvent designer la meme personne sans etre
 * identiques : l'une dit tout ce que l'autre dit, parfois davantage.
 *
 * « Awa Diop » et « Awa Marie Diop » — le prenom compose n'est ecrit en entier
 * qu'une fois sur deux. « Diop » et « Awa Diop » — le prenom manque sur une
 * feuille. Deux freres, « Awa Diop » et « Moussa Diop », ne sont pas dans ce
 * cas : aucun des deux noms n'est contenu dans l'autre.
 *
 * Cette compatibilite ne suffit jamais a elle seule a confondre deux fiches :
 * elle se corrobore par une adresse ou un numero identique.
 */
function nomsCompatibles(a, b) {
  const ma = motsDuNom(a?.nom, a?.prenom);
  const mb = motsDuNom(b?.nom, b?.prenom);
  if (!ma.size || !mb.size) return false;
  const [petit, grand] = ma.size <= mb.size ? [ma, mb] : [mb, ma];
  for (const mot of petit) if (!grand.has(mot)) return false;
  return true;
}

/* Distance d'edition, bornee : on ne cherche qu'a savoir si deux mots sont a
   une faute l'un de l'autre, pas de combien ils different. */
function distanceMots(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 99;
  let ligne = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const suivante = [i];
    for (let j = 1; j <= b.length; j++) {
      suivante[j] = a[i - 1] === b[j - 1]
        ? ligne[j - 1]
        : 1 + Math.min(ligne[j], ligne[j - 1], suivante[j - 1]);
    }
    ligne = suivante;
  }
  return ligne[b.length];
}

/* Deux ecritures d'un meme mot a une faute pres. Les mots courts en sont
   exclus : « Awa » et « Ada » sont a une lettre l'un de l'autre et sont deux
   prenoms differents. */
const LONGUEUR_MINIMALE_FAUTE = 5;
function motProche(a, b) {
  if (a === b) return true;
  if (a.length < LONGUEUR_MINIMALE_FAUTE || b.length < LONGUEUR_MINIMALE_FAUTE) return false;
  return distanceMots(a, b) <= 1;
}

/**
 * Deux ecritures d'un nom dont une seule porte une faute de frappe.
 *
 * « Fatou Ndiaye » et « Fatou Ndiay » : autant de mots, tous identiques sauf
 * un, et celui-la est a une lettre pres. Exiger que tout le reste soit exact
 * est ce qui separe la faute de frappe de deux personnes differentes — deux
 * freres « Awa Sow » et « Moussa Sow » partagent un mot, mais l'autre n'est pas
 * une variante du premier.
 *
 * Comme la compatibilite, cela ne suffit jamais seul : il faut la meme adresse
 * ou le meme numero a cote.
 */
function nomsProches(x, y) {
  const a = [...motsDuNom(x?.nom, x?.prenom)];
  const b = [...motsDuNom(y?.nom, y?.prenom)];
  if (!a.length || a.length !== b.length) return false;

  /* Les mots identiques d'abord : sinon un rapprochement approximatif pourrait
     consommer le mot qu'un autre avait en commun. */
  const restantsA = [];
  const restantsB = [...b];
  for (const mot of a) {
    const i = restantsB.indexOf(mot);
    if (i >= 0) restantsB.splice(i, 1);
    else restantsA.push(mot);
  }

  /* Une seule faute tolereee : au-dela, ce sont deux noms differents. */
  if (restantsA.length !== 1 || restantsB.length !== 1) return false;
  return motProche(restantsA[0], restantsB[0]);
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
  compacterNom,
  clePersonne,
  cleApprochee,
  nomsCompatibles,
  nomsProches,
  memePersonne,
};
