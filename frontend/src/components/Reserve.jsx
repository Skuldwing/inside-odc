import { Archive } from "lucide-react";

/* Le plafond et la réserve, côté écran.
 *
 * Le serveur fait le calcul et le renvoie dans « reserve » : trois écrans le
 * lisent — la carte du partenaire, sa fiche, et le tableau « Objectifs par
 * partenaire » — et ils doivent dire le même chiffre. On ne recalcule donc rien
 * ici.
 *
 * Sauf pendant un déploiement, où le front neuf peut parler à l'ancien serveur
 * pendant une poignée de minutes. « lireReserve » retombe alors sur l'affichage
 * d'avant — réalisé brut, pourcentage borné à 100 — plutôt que sur des zéros :
 * mieux vaut l'ancien chiffre que pas de chiffre.
 */
export function lireReserve(source, { objectif, realise } = {}) {
  if (source && typeof source === "object") return source;

  const obj = Math.max(0, Math.floor(Number(objectif) || 0));
  const brut = Math.max(0, Math.floor(Number(realise) || 0));
  return {
    objectif: obj,
    brut,
    retenu: brut,
    surplus: 0,
    reserve_activee: 0,
    reserve_disponible: 0,
    plafonne: false,
    pourcentage: obj > 0 ? Math.min(100, Math.round((brut / obj) * 100)) : 0,
  };
}

/* Ce qui attend, et ce qui a été libéré. Sans cette mention, un réalisé bridé
   se lit comme un réalisé complet — et c'est précisément ce qu'il ne faut pas,
   puisqu'il finira recopié dans un rapport. */
export function BadgeReserve({ reserve, className = "" }) {
  if (!reserve) return null;
  const { reserve_disponible: dispo = 0, reserve_activee: activee = 0 } = reserve;
  if (dispo === 0 && activee === 0) return null;

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {dispo > 0 && (
        <span
          className="badge bg-sky-100 text-sky-800 inline-flex items-center gap-1"
          title={`${dispo} participation${dispo > 1 ? "s" : ""} réalisée${dispo > 1 ? "s" : ""} au-delà de l'objectif. Un administrateur peut les activer depuis la fiche du partenaire.`}
        >
          <Archive className="w-3 h-3" />
          +{dispo} en réserve
        </span>
      )}
      {activee > 0 && (
        <span
          className="badge bg-emerald-100 text-emerald-800"
          title={`${activee} participation${activee > 1 ? "s" : ""} de la réserve comptée${activee > 1 ? "s" : ""} dans les indicateurs.`}
        >
          +{activee} activée{activee > 1 ? "s" : ""}
        </span>
      )}
    </span>
  );
}
