/* L'objectif comme plafond, et le surplus mis de cote.
 *
 * Un partenaire qui a un objectif de 400 et qui a realise 2025 participations
 * affichait 2025, et une barre bloquee a 100 %. Le chiffre etait vrai mais il
 * ne servait a rien : on ne peut pas lire un engagement contractuel dans un
 * nombre qui le depasse de cinq fois, et on ne peut pas non plus etaler ce
 * surplus sur l'annee suivante puisque rien ne le retient.
 *
 * On retient donc le compte a l'objectif, et on garde le reste en reserve. Ce
 * n'est pas un arrondi : le compte brut reste entier, toujours lisible a cote.
 * La reserve n'est pas un stock qu'on deplace — c'est la part d'un compte reel
 * qu'on choisit de ne pas encore porter au credit du partenaire. Un
 * administrateur la libere quand il en a besoin, en tout ou en partie, et elle
 * entre alors dans les indicateurs.
 *
 * Deux proprietes a ne pas perdre de vue.
 *
 * Sans objectif, pas de plafond. Un partenaire dont « objective_beneficiaries »
 * vaut zero garde son compte entier. Plafonner a zero effacerait d'un coup le
 * realise de tous les partenaires qui n'ont pas d'engagement chiffre — c'est la
 * majorite, et ce serait un desastre silencieux.
 *
 * La part liberee est toujours ramenee au surplus reellement disponible. Le
 * surplus est une grandeur calculee : il bouge quand une liste est corrigee,
 * quand quelqu'un est retire d'une activite, quand on regarde une periode plus
 * courte. Une reserve activee a 1625 sur l'annee ne doit pas faire apparaitre
 * 1625 de plus sur un mois ou le partenaire n'a meme pas atteint son objectif.
 */

/* Les colonnes a joindre a toute requete qui veut appliquer la regle. Mises
   ici pour qu'on ne les oublie pas d'un cote et pas de l'autre. */
const COLONNES_RESERVE = "pr.objective_beneficiaries, pr.reserve_activee";

function entierPositif(valeur) {
  const n = Math.floor(Number(valeur) || 0);
  return n > 0 ? n : 0;
}

/**
 * Applique le plafond et la reserve a un couple objectif / realise.
 *
 * @param {object} e
 * @param {number} e.objectif          « objective_beneficiaries » du partenaire
 * @param {number} e.realise           le compte brut, tel que la base le donne
 * @param {number} e.reserve_activee   la part deja liberee par un administrateur
 * @returns {{objectif:number, brut:number, retenu:number, surplus:number,
 *            reserve_activee:number, reserve_disponible:number,
 *            plafonne:boolean, pourcentage:number}}
 */
function plafonnerObjectif({ objectif, realise, reserve_activee } = {}) {
  const obj = entierPositif(objectif);
  const brut = entierPositif(realise);

  /* Pas d'objectif, pas de plafond : le compte passe tel quel. */
  if (obj === 0) {
    return {
      objectif: 0,
      brut,
      retenu: brut,
      surplus: 0,
      reserve_activee: 0,
      reserve_disponible: 0,
      plafonne: false,
      pourcentage: 0,
    };
  }

  const surplus = Math.max(0, brut - obj);
  /* On ne libere jamais plus qu'il n'existe : voir l'en-tete. */
  const liberee = Math.min(entierPositif(reserve_activee), surplus);
  const retenu = Math.min(brut, obj) + liberee;

  return {
    objectif: obj,
    brut,
    retenu,
    surplus,
    reserve_activee: liberee,
    reserve_disponible: surplus - liberee,
    /* « plafonne » dit qu'une part du reel n'est pas comptee en ce moment.
       C'est lui qui declenche la mention a l'ecran : un chiffre bride doit se
       voir, sinon il part dans un rapport comme s'il etait complet. */
    plafonne: retenu < brut,
    pourcentage: Math.round((retenu / obj) * 100),
  };
}

/**
 * La meme chose pour une ligne de requete, en conservant ses autres champs.
 * « realise » nomme la colonne qui porte le compte brut.
 */
function avecReserve(ligne, realise = "value") {
  const calcul = plafonnerObjectif({
    objectif: ligne.objective_beneficiaries,
    realise: ligne[realise],
    reserve_activee: ligne.reserve_activee,
  });
  return { ...ligne, reserve: calcul };
}

module.exports = { COLONNES_RESERVE, plafonnerObjectif, avecReserve };
