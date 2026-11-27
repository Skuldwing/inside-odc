/**
 * La mémoire d'une liste, le temps d'aller voir une fiche et de revenir.
 *
 * Ouvrir une activité depuis la page 3, au milieu de la liste, puis revenir,
 * ramenait en page 1, tout en haut, filtres effacés : il fallait tout refaire
 * pour retrouver où l'on en était.
 *
 * On garde donc, au moment d'ouvrir la fiche, la page, les filtres et la
 * position dans la page. Pas de cookie : rien n'a à partir au serveur. Le
 * stockage de session du navigateur suffit — il est propre à l'onglet, et
 * s'efface quand on le ferme. Au-delà de trente minutes, on repart de zéro :
 * on ne revient pas sur une liste vieille d'une matinée.
 */
const DUREE_MS = 30 * 60 * 1000;

export function memoriser(cle, etat) {
  try {
    sessionStorage.setItem(cle, JSON.stringify({ ...etat, le: Date.now() }));
  } catch {
    /* Stockage indisponible (navigation privée stricte) : on n'en meurt pas. */
  }
}

export function relire(cle) {
  try {
    const v = JSON.parse(sessionStorage.getItem(cle) || "null");
    if (!v || typeof v !== "object" || Date.now() - Number(v.le || 0) > DUREE_MS) return null;
    return v;
  } catch {
    return null;
  }
}

export function oublier(cle) {
  try {
    sessionStorage.removeItem(cle);
  } catch {
    /* rien */
  }
}
