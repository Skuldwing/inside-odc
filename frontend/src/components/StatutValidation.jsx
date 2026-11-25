import { CheckCircle2, Clock, XCircle } from "lucide-react";

/* Où en est la déclaration d'une activité : le partenaire déclare, un
   administrateur ODC valide. Un partenaire ne voit que ce statut ; le score
   et les contrôles automatiques restent aux administrateurs. */
const STATUTS = {
  validee: { label: "Validée par ODC", cls: "bg-emerald-50 border-emerald-200 text-emerald-700", Icone: CheckCircle2 },
  rejetee: { label: "Rejetée par ODC", cls: "bg-red-50 border-red-200 text-red-700", Icone: XCircle },
  a_verifier: { label: "En attente de validation", cls: "bg-amber-50 border-amber-200 text-amber-700", Icone: Clock },
};

export default function StatutValidation({ statut, score, admin = false, className = "" }) {
  const s = STATUTS[statut] || STATUTS.a_verifier;
  const { Icone } = s;
  const avecScore = admin && score != null && Number.isFinite(Number(score));
  return (
    <span
      className={`badge inline-flex items-center gap-1 text-xs font-medium ${s.cls} ${className}`}
      title={avecScore ? `Complétude du dossier : ${Math.round(Number(score))} %` : undefined}
    >
      <Icone className="h-3 w-3" aria-hidden="true" />
      {s.label}
      {avecScore && <span className="font-normal opacity-75">· {Math.round(Number(score))} %</span>}
    </span>
  );
}
