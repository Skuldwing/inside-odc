/**
 * Chercher une personne comme on la cherche vraiment.
 *
 * Les listes de presence sont saisies a la main, sur le terrain : un prenom
 * accentue ici, le meme sans accent la, un numero tantot colle, tantot espace,
 * tantot precede de l'indicatif. Une recherche qui compare les chaines telles
 * quelles ne retrouve personne, et l'utilisateur en conclut que la fiche
 * n'existe pas.
 *
 * Ces regles sont partagees par la page Participants et par la barre de
 * recherche globale : les deux doivent trouver la meme chose, sinon on cherche
 * deux fois, au meme endroit, avec deux resultats differents.
 */

/* translate() plutot que l'extension unaccent : celle-ci demande un CREATE
   EXTENSION que la base de production n'a pas forcement le droit de faire. */
const LETTRES_ACCENTUEES = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ";
const LETTRES_SIMPLES = "aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY";

/** Accents retires et minuscules, cote SQL. */
const DEPLIE = (colonne) =>
  `lower(translate(coalesce(${colonne}, ''), '${LETTRES_ACCENTUEES}', '${LETTRES_SIMPLES}'))`;

/** Le meme pliage, cote JavaScript, pour le motif recherche. */
function deplier(valeur) {
  return String(valeur)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/* « % » et « _ » sont des jokers en SQL : tapes par quelqu'un qui cherche
   « 100_ouvriers », ils elargiraient la recherche au lieu de la restreindre. */
const echapperMotif = (mot) => mot.replace(/([\\%_])/g, "\\$1");

/** Le numero compare chiffre a chiffre, quelle que soit sa mise en forme. */
const CHIFFRES_DE = (colonne) =>
  `regexp_replace(coalesce(${colonne}, ''), '[^0-9]', '', 'g')`;

/* Un numero de telephone se tape comme il s'ecrit : « 77 123 45 67 », avec des
   espaces. Decoupe en mots, il donnerait « 77 », « 123 »… — des fragments trop
   courts pour designer qui que ce soit. Quand toute la saisie n'est faite que
   de chiffres et de ponctuation de numero, on la traite donc d'un bloc. */
function estNumero(search) {
  return search.length > 0
    && /^[0-9+().\-\s]+$/.test(search)
    && search.replace(/\D/g, "").length >= 3;
}

const MOTS_MAX = 8;

/**
 * Traduit une saisie en conditions SQL.
 *
 * Chaque mot tape doit se retrouver quelque part sur la ligne, mais pas
 * forcement dans la meme colonne : c'est ce qui permet de chercher « aminata
 * ndiaye » — le prenom est dans une colonne, le nom dans une autre —, aussi
 * bien que « ndiaye aminata », ou « ndiaye kids tech » pour ne garder que ses
 * seances Kids Tech.
 *
 * @param {string} search        ce qui a ete tape
 * @param {object} options
 * @param {string[]} options.colonnes    colonnes de texte, qualifiees
 * @param {string} [options.telephone]   colonne du numero, si elle existe
 * @param {number} [options.depart]      premier numero de parametre libre
 * @returns {{conditions: string[], params: any[], nextIdx: number}}
 */
function conditionsDeRecherche(search, { colonnes, telephone = null, depart = 1 }) {
  const conditions = [];
  const params = [];
  let idx = depart;

  const texte = String(search || "").trim();
  if (!texte) return { conditions, params, nextIdx: idx };

  const mots = estNumero(texte)
    ? [texte]
    : texte.split(/\s+/).filter(Boolean).slice(0, MOTS_MAX);

  for (const mot of mots) {
    const alternatives = colonnes.map((c) => `${DEPLIE(c)} LIKE $${idx}`);
    const chiffres = mot.replace(/\D/g, "");
    const avecNumero = telephone && chiffres.length >= 3;

    if (avecNumero) alternatives.push(`${CHIFFRES_DE(telephone)} LIKE $${idx + 1}`);

    conditions.push(`(${alternatives.join(" OR ")})`);
    params.push(`%${echapperMotif(deplier(mot))}%`);
    idx++;

    if (avecNumero) {
      params.push(`%${chiffres}%`);
      idx++;
    }
  }

  return { conditions, params, nextIdx: idx };
}

module.exports = {
  DEPLIE, deplier, echapperMotif, CHIFFRES_DE, estNumero, conditionsDeRecherche,
};
