/**
 * Cartons vert et rouge du module Vote.
 *
 * Principe demande par l'equipe : quand un jure termine de noter un projet, il
 * voit un carton vert si sa note atteint la moyenne, un carton rouge sinon.
 * Une fois tous les jures passes, on compte les cartons : plus de verts que de
 * rouges, le projet est valide ; plus de rouges, il est rejete.
 *
 * Toute la logique vit ici, et nulle part ailleurs : la carte que voit le jure
 * et le verdict qu'affiche l'administrateur doivent decouler du meme calcul,
 * sinon les deux ecrans finissent par se contredire devant un jury reuni.
 */

/* Un critere peut avoir sa propre echelle et son propre poids. La note d'un
   jure est donc une moyenne ponderee, exprimee sur l'echelle ponderee des
   criteres — et non sur 10 ou sur 20 par convention. */
function noteMaximale(criteres) {
  const poidsTotal = criteres.reduce((s, c) => s + Number(c.weight || 1), 0);
  if (!poidsTotal) return 0;
  const somme = criteres.reduce((s, c) => s + Number(c.scale || 10) * Number(c.weight || 1), 0);
  return somme / poidsTotal;
}

/**
 * Le seuil a atteindre. « La moyenne » vaut la moitie du maximum ; le
 * pourcentage reste reglable par session, pour un jury qui voudrait placer la
 * barre ailleurs.
 */
function seuilDeValidation(criteres, seuilPct = 50) {
  const pct = Number.isFinite(Number(seuilPct)) ? Number(seuilPct) : 50;
  const borne = Math.min(100, Math.max(0, pct));
  return (noteMaximale(criteres) * borne) / 100;
}

/**
 * Note ponderee d'un jure sur un projet.
 * `notes` : tableau { criteria_id, score }.
 * Renvoie null tant que tous les criteres ne sont pas notes : une notation
 * partielle donnerait un rouge trompeur a quelqu'un qui n'a pas fini.
 */
function noteDuJure(notes, criteres) {
  if (!criteres.length) return null;

  const parCritere = new Map();
  for (const n of notes || []) {
    const valeur = Number(n.score);
    if (Number.isFinite(valeur)) parCritere.set(String(n.criteria_id), valeur);
  }
  if (parCritere.size < criteres.length) return null;

  let somme = 0;
  let poidsTotal = 0;
  for (const c of criteres) {
    const valeur = parCritere.get(String(c.id));
    if (valeur === undefined) return null;
    const poids = Number(c.weight || 1);
    somme += valeur * poids;
    poidsTotal += poids;
  }
  return poidsTotal ? somme / poidsTotal : null;
}

/**
 * Le carton d'un jure : « verte », « rouge », ou null s'il n'a pas fini.
 * L'egalite avec le seuil vaut la moyenne, donc carton vert.
 */
function cartonDuJure(notes, criteres, seuil) {
  const note = noteDuJure(notes, criteres);
  if (note === null) return null;
  return note >= seuil ? "verte" : "rouge";
}

/**
 * Verdict d'un projet a partir du decompte des cartons.
 *
 * Autant de verts que de rouges : « Egalite », sans plus. L'equipe a choisi de
 * ne pas faire pencher le resultat d'un cote — le jury tranche lui-meme, la
 * plateforme se contente de constater.
 */
function verdictProjet({ vertes = 0, rouges = 0 }) {
  if (vertes === 0 && rouges === 0) return "en_attente";
  if (vertes > rouges) return "valide";
  if (rouges > vertes) return "rejete";
  return "egalite";
}

const LIBELLE_VERDICT = {
  valide: "Projet validé",
  rejete: "Projet rejeté",
  egalite: "Égalité",
  en_attente: "En attente des notations",
};

/**
 * Decompte complet pour un projet.
 * `notesParJure` : Map ou objet { jury_id: [ { criteria_id, score } ] }.
 */
function decompteProjet(notesParJure, criteres, seuil, juryTotal) {
  let vertes = 0;
  let rouges = 0;
  let incomplets = 0;

  const entrees = notesParJure instanceof Map
    ? [...notesParJure.entries()]
    : Object.entries(notesParJure || {});

  for (const [, notes] of entrees) {
    const carton = cartonDuJure(notes, criteres, seuil);
    if (carton === "verte") vertes += 1;
    else if (carton === "rouge") rouges += 1;
    else incomplets += 1;
  }

  /* Les jures qui n'ont pas encore ouvert le projet ne figurent pas dans les
     notes : on les compte comme manquants pour savoir si le tour est fini. */
  const ayantVote = vertes + rouges;
  const manquants = Math.max(0, (juryTotal || 0) - ayantVote);
  const complet = (juryTotal || 0) > 0 && manquants === 0;

  const verdict = complet ? verdictProjet({ vertes, rouges }) : "en_attente";

  return {
    vertes,
    rouges,
    incomplets,
    manquants,
    complet,
    verdict,
    verdict_libelle: LIBELLE_VERDICT[verdict],
  };
}

module.exports = {
  noteMaximale,
  seuilDeValidation,
  noteDuJure,
  cartonDuJure,
  verdictProjet,
  decompteProjet,
  LIBELLE_VERDICT,
};
