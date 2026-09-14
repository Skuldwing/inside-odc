import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import api from "../api";

/**
 * Etat d'authentification du domaine expediteur.
 *
 * Depuis fevrier 2024, Gmail, Yahoo et Microsoft refusent les messages dont le
 * domaine n'est pas authentifie. Rien dans la plateforme ne permettait de
 * savoir ou on en etait : on decouvrait le probleme par les messages qui
 * n'arrivaient pas. Ce panneau interroge le DNS en direct.
 */

const LIBELLES = {
  spf: "SPF — qui a le droit d'envoyer",
  dkim: "DKIM — signature des messages",
  dmarc: "DMARC — que faire en cas d'echec",
  verification_brevo: "Vérification du domaine chez Brevo",
  reception: "Réception (MX)",
};

const ORDRE = ["spf", "dkim", "dmarc", "verification_brevo", "reception"];

function Pastille({ statut }) {
  if (statut === "ok") {
    return <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />;
  }
  if (statut === "attention") {
    return <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden="true" />;
  }
  return <XCircle className="h-4 w-4 flex-shrink-0 text-red-600" aria-hidden="true" />;
}

export default function DeliverabilitePanel() {
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    try {
      const res = await api.get("/email/diagnostic");
      setData(res.data);
      /* On n'ouvre le detail d'office que s'il y a quelque chose a corriger :
         quand tout va bien, une ligne suffit. */
      const ko = Object.values(res.data.controles || {}).filter((c) => c.statut !== "ok").length;
      setOuvert(ko > 0 || (res.data.configuration?.alertes || []).length > 0);
    } catch (err) {
      setErreur(err?.response?.data?.error || "Diagnostic indisponible.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  if (chargement && !data) {
    return (
      <div className="card-solid flex items-center gap-2 p-4 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Vérification du domaine expéditeur…
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="card-solid p-4 text-sm text-slate-600">
        {erreur}
      </div>
    );
  }

  if (!data) return null;

  const controles = data.controles || {};
  const alertes = data.configuration?.alertes || [];
  const bloquants = ORDRE.filter((c) => controles[c] && controles[c].statut === "manquant");
  const tout_ok = bloquants.length === 0 && alertes.length === 0;

  return (
    <section
      className={`card-solid overflow-hidden border ${
        tout_ok ? "border-emerald-200" : "border-amber-300"
      }`}
    >
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={ouvert}
      >
        <ShieldCheck
          className={`h-5 w-5 flex-shrink-0 ${tout_ok ? "text-emerald-600" : "text-amber-600"}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {tout_ok
              ? "Domaine expéditeur authentifié"
              : `Envoi d'emails : ${bloquants.length + alertes.length} point${
                  bloquants.length + alertes.length > 1 ? "s" : ""
                } à corriger`}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {data.domaine ? `${data.domaine} · ` : ""}
            envoi via {data.configuration?.fournisseur || "aucun service"}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${ouvert ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {ouvert && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4">
          {alertes.map((a) => (
            <p
              key={a}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>{a}</span>
            </p>
          ))}

          <ul className="space-y-2">
            {ORDRE.filter((cle) => controles[cle]).map((cle) => {
              const c = controles[cle];
              return (
                <li key={cle} className="flex items-start gap-2">
                  <Pastille statut={c.statut} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{LIBELLES[cle]}</p>
                    <p className="text-xs text-slate-600">{c.detail}</p>
                    {c.valeur && (
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{c.valeur}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {bloquants.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <p className="font-medium text-slate-800">Ces enregistrements se posent dans le DNS</p>
              <p className="mt-1">
                Ils ne dépendent pas de la plateforme : c&apos;est l&apos;administrateur de la zone
                DNS du domaine qui doit les créer. Les valeurs exactes de DKIM et du code de
                vérification sont fournies par Brevo, dans <em>Expéditeurs &amp; IP → Domaines</em>.
                Revenez ici ensuite : la propagation prend de quelques minutes à quelques heures.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">
              Vérifié le {new Date(data.verifie_le).toLocaleString("fr-FR")}
            </p>
            <button
              type="button"
              onClick={charger}
              disabled={chargement}
              className="btn-ghost border text-xs"
            >
              {chargement ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Revérifier
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
