import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Le filet sous chaque page.
 *
 * Sans lui, la moindre erreur pendant l'affichage d'une page démontait toute
 * l'application : l'écran restait blanc, sans un mot, et rien ne permettait
 * de dire ce qui s'était passé.
 *
 * La cause la plus fréquente n'est pas un bug de la page. Chaque page est un
 * fichier chargé à la demande, dont le nom change à chaque mise en ligne.
 * Quelqu'un qui garde la plateforme ouverte pendant un déploiement demande
 * ensuite un fichier de l'ancienne version, qui n'existe plus : le chargement
 * échoue. Recharger suffit — on le fait donc tout seul, une fois.
 *
 * Pour toute autre erreur, la page dit ce qui s'est passé et propose de
 * recharger, au lieu de laisser un écran vide. Le reste de l'application —
 * menu, en-tête — reste utilisable.
 */

const CLE_RECHARGEMENT = "inside-odc-rechargement-auto";
const DELAI_ENTRE_RECHARGEMENTS_MS = 20000;

/* Un module de page qui n'a pas pu être chargé : le message varie d'un
   navigateur à l'autre. */
export function estErreurDeChargement(erreur) {
  const message = String(erreur?.message || erreur || "");
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Expected a JavaScript(-or-Wasm)? module script|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
    message,
  );
}

/* Recharge la page, mais une seule fois en peu de temps : si la nouvelle
   version échoue aussi, on ne tourne pas en boucle — on affiche l'erreur. */
export function rechargerUneFois() {
  try {
    const dernier = Number(sessionStorage.getItem(CLE_RECHARGEMENT) || 0);
    if (Date.now() - dernier < DELAI_ENTRE_RECHARGEMENTS_MS) return false;
    sessionStorage.setItem(CLE_RECHARGEMENT, String(Date.now()));
  } catch {
    /* Stockage indisponible : on recharge quand même, une fois par page. */
  }
  window.location.reload();
  return true;
}

export default class ErreurPage extends Component {
  constructor(props) {
    super(props);
    this.state = { erreur: null, rechargement: false };
  }

  static getDerivedStateFromError(erreur) {
    return { erreur };
  }

  componentDidCatch(erreur, info) {
    console.error("[PAGE]", erreur, info?.componentStack);
    if (estErreurDeChargement(erreur) && rechargerUneFois()) {
      this.setState({ rechargement: true });
    }
  }

  componentDidUpdate(precedent) {
    /* Une autre page : on repart de zéro. */
    if (precedent.cle !== this.props.cle && this.state.erreur) {
      this.setState({ erreur: null, rechargement: false });
    }
  }

  render() {
    const { erreur, rechargement } = this.state;
    if (!erreur) return this.props.children;

    const chargement = estErreurDeChargement(erreur);
    const conteneur = this.props.pleinePage
      ? "flex min-h-screen items-center justify-center bg-slate-50 p-4"
      : "flex min-h-[50vh] items-center justify-center p-4";

    return (
      <div className={conteneur}>
        <div
          role="alert"
          className="w-full max-w-lg space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              {rechargement ? (
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">
                {rechargement
                  ? "Mise à jour de la plateforme…"
                  : "Cette page n'a pas pu s'afficher"}
              </p>
              <p className="mt-1 text-slate-600">
                {chargement
                  ? "Une nouvelle version de la plateforme a été mise en ligne pendant que la page était ouverte. Rechargez pour l'obtenir."
                  : "Une erreur s'est produite pendant l'affichage. Rechargez la page ; si l'erreur revient, transmettez le détail ci-dessous."}
              </p>
            </div>
          </div>

          {!chargement && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
              {String(erreur?.message || erreur)}
            </pre>
          )}

          {!rechargement && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary text-sm"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Recharger la page
              </button>
              {!this.props.pleinePage && (
                <a href="/dashboard" className="btn-ghost border border-slate-200 text-sm">
                  Tableau de bord
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}
