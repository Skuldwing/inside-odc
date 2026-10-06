import { useEffect, useState } from "react";
import { Archive, Loader2, Undo2 } from "lucide-react";
import api from "../../api";
import { useToast } from "../ui";

/* La réserve d'un partenaire, et le geste qui la libère.
 *
 * Le réalisé d'un partenaire est retenu à son objectif. Ce qu'il a fait au-delà
 * n'est pas perdu : c'est le surplus, et il attend ici. Un administrateur le
 * fait entrer dans les indicateurs quand il en a besoin — en tout ou en partie,
 * et il peut le remettre de côté.
 *
 * Trois chiffres sont montrés ensemble parce qu'aucun des trois ne se comprend
 * seul : ce qui est porté au crédit du partenaire aujourd'hui, ce qu'il a
 * réellement réalisé, et l'écart entre les deux. Afficher le premier sans les
 * autres, c'est exactement ce qui ferait recopier un chiffre bridé dans un
 * rapport sans savoir qu'il l'est.
 */

/* Mêmes clés et même durée que « AdminPinGate » : un PIN saisi ici vaut pour le
   reste de la session, et un PIN saisi ailleurs dispense de le redemander. */
const PIN_TTL_MS = 20 * 60 * 1000;

function pinEnSession() {
  const pin = sessionStorage.getItem("admin_pin");
  const ts = Number(sessionStorage.getItem("admin_pin_time") || 0);
  if (pin && ts && Date.now() - ts > PIN_TTL_MS) {
    sessionStorage.removeItem("admin_pin");
    sessionStorage.removeItem("admin_pin_time");
    return null;
  }
  return pin || null;
}

export default function ReservePartenaire({ partnerId, reserve, onChange }) {
  const toast = useToast();
  const [montant, setMontant] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [pinRequis, setPinRequis] = useState(false);
  const [pin, setPin] = useState("");
  /* Ce que l'on relancera une fois le PIN accepté. */
  const [enAttente, setEnAttente] = useState(null);

  const objectif = Number(reserve?.objectif || 0);
  const dispo = Number(reserve?.reserve_disponible || 0);
  const activee = Number(reserve?.reserve_activee || 0);
  const brut = Number(reserve?.brut || 0);
  const retenu = Number(reserve?.retenu || 0);

  useEffect(() => {
    setMontant("");
  }, [activee, dispo]);

  /* Sans objectif chiffré il n'y a pas de plafond, donc pas de réserve : le
     panneau n'aurait rien à dire. */
  if (objectif === 0) return null;

  const envoyer = async (corps) => {
    setEnvoi(true);
    try {
      const { data } = await api.post(`/partners/${partnerId}/reserve`, corps);
      setPinRequis(false);
      setPin("");
      setEnAttente(null);
      const n = Number(data?.reserve?.reserve_activee || 0);
      toast?.success?.(
        n === 0
          ? "Réserve remise de côté : le réalisé est de nouveau retenu à l'objectif."
          : `${n} participation${n > 1 ? "s" : ""} de la réserve comptée${n > 1 ? "s" : ""} dans les indicateurs.`
      );
      onChange?.(data);
    } catch (err) {
      /* 403 ici veut dire « PIN manquant ou périmé » : la page entière est déjà
         réservée aux administrateurs. On le demande sur place plutôt que de
         renvoyer l'utilisateur ailleurs pour revenir. */
      if (err?.response?.status === 403) {
        setEnAttente(corps);
        setPinRequis(true);
        if (pin) toast?.error?.("PIN incorrect.");
      } else {
        toast?.error?.(err?.response?.data?.error || "Échec de l'opération.");
      }
    } finally {
      setEnvoi(false);
    }
  };

  const demander = (corps) => {
    const existant = pinEnSession();
    if (!existant) {
      setEnAttente(corps);
      setPinRequis(true);
      return;
    }
    envoyer(corps);
  };

  const validerPin = async (e) => {
    e.preventDefault();
    if (!pin) return;
    sessionStorage.setItem("admin_pin", pin);
    sessionStorage.setItem("admin_pin_time", String(Date.now()));
    if (enAttente) await envoyer(enAttente);
  };

  const saisi = Math.floor(Number(montant));
  const saisiValide = Number.isFinite(saisi) && saisi > 0 && saisi <= dispo;

  return (
    <div className="card-solid p-5 space-y-3">
      <h2 className="font-semibold text-slate-900 flex items-center gap-2">
        <Archive className="w-4 h-4 text-sky-600" />
        Réserve
      </h2>

      <p className="text-sm text-slate-500">
        Le réalisé de ce partenaire est retenu à son objectif. Ce qu'il a fait
        au-delà attend ici et n'entre dans les indicateurs que si vous l'activez.
      </p>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-slate-100 p-2.5">
          <p className="text-[11px] text-slate-500 mb-0.5">Compté</p>
          <p className="text-lg font-semibold text-slate-900">{retenu}</p>
          <p className="text-[11px] text-slate-400">sur {objectif}</p>
        </div>
        <div className="rounded-xl border border-slate-100 p-2.5">
          <p className="text-[11px] text-slate-500 mb-0.5">Réalisé réel</p>
          <p className="text-lg font-semibold text-slate-900">{brut}</p>
          <p className="text-[11px] text-slate-400">participations</p>
        </div>
        <div className={`rounded-xl border p-2.5 ${dispo > 0 ? "border-sky-200 bg-sky-50/60" : "border-slate-100"}`}>
          <p className="text-[11px] text-slate-500 mb-0.5">En réserve</p>
          <p className={`text-lg font-semibold ${dispo > 0 ? "text-sky-700" : "text-slate-300"}`}>{dispo}</p>
          <p className="text-[11px] text-slate-400">{activee > 0 ? `${activee} activée${activee > 1 ? "s" : ""}` : "rien d'activé"}</p>
        </div>
      </div>

      {dispo === 0 && activee === 0 && (
        <p className="text-sm text-slate-500">
          {brut >= objectif
            ? "Objectif atteint, sans dépassement : il n'y a rien en réserve."
            : "Objectif pas encore atteint : la réserve se remplira au-delà de " +
              `${objectif} participations.`}
        </p>
      )}

      {(dispo > 0 || activee > 0) && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              max={dispo}
              className="input text-sm flex-1"
              placeholder={dispo > 0 ? `1 à ${dispo}` : "Rien à activer"}
              value={montant}
              disabled={envoi || dispo === 0}
              onChange={(e) => setMontant(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary text-sm shrink-0"
              disabled={envoi || !saisiValide}
              onClick={() => demander({ activer: activee + saisi })}
            >
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activer"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {dispo > 0 && (
              <button
                type="button"
                className="btn-ghost border text-sm"
                disabled={envoi}
                onClick={() => demander({ tout: true })}
              >
                Tout activer ({dispo})
              </button>
            )}
            {activee > 0 && (
              <button
                type="button"
                className="btn-ghost border text-sm inline-flex items-center gap-1.5"
                disabled={envoi}
                onClick={() => demander({ activer: 0 })}
              >
                <Undo2 className="w-3.5 h-3.5" />
                Tout remettre en réserve
              </button>
            )}
          </div>
        </div>
      )}

      {pinRequis && (
        <form onSubmit={validerPin} className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-sm text-amber-900">
            PIN admin requis : activer la réserve change les indicateurs du
            partenaire.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              className="input text-sm flex-1"
              placeholder="PIN"
              value={pin}
              autoFocus
              onChange={(e) => setPin(e.target.value)}
            />
            <button type="submit" className="btn-primary text-sm shrink-0" disabled={envoi || !pin}>
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Valider"}
            </button>
          </div>
        </form>
      )}

      {reserve?.reserve_activee > 0 && (
        <p className="text-xs text-slate-400">
          Chaque activation est inscrite au journal d'audit, avec son auteur et
          l'écart qu'elle crée.
        </p>
      )}
    </div>
  );
}
