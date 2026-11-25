import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapPin, Shuffle, Save, Trash2, OctagonAlert } from "lucide-react";
import api from "../../api";
import { useConfirm, useToast } from "../ui";

/* Aller voir. La plateforme tire au hasard des activités à venir ; un agent
   ODC y passe sans prévenir et note combien de personnes il a vues. L'écart
   avec la liste déclarée ensuite remonte en alerte sur l'activité. */

const dateFr = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const marge = (constate) => Math.max(3, Math.ceil(constate * 0.2));

function LigneVisite({ v, onEnregistrer, onRetirer }) {
  const [saisie, setSaisie] = useState({
    effectif_constate: v.effectif_constate ?? "",
    visite_le: v.visite_le ? String(v.visite_le).slice(0, 10) : "",
    visiteur: v.visiteur || "",
    commentaire: v.commentaire || "",
  });
  const [enCours, setEnCours] = useState(false);
  const constate = v.effectif_constate;
  const ecart = constate != null && v.effectif_declare > constate + marge(constate);
  const modifie =
    String(saisie.effectif_constate) !== String(v.effectif_constate ?? "") ||
    saisie.visite_le !== (v.visite_le ? String(v.visite_le).slice(0, 10) : "") ||
    saisie.visiteur !== (v.visiteur || "") ||
    saisie.commentaire !== (v.commentaire || "");
  const champ = (cle) => (e) => setSaisie((s) => ({ ...s, [cle]: e.target.value }));

  return (
    <li className={`space-y-2 rounded-xl border p-3 ${ecart ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/activities/${v.activity_id}`} className="font-semibold text-slate-900 hover:text-orange-700 hover:underline">
            {v.title}
          </Link>
          <p className="text-xs text-slate-500">
            {dateFr(v.activity_date)} · {v.location || "lieu non renseigné"} · {v.partenaire}
          </p>
        </div>
        <div className="text-right text-xs">
          <p className="text-slate-500">
            Déclarés : <strong className="tabular-nums text-slate-800">{v.effectif_declare}</strong>
            {constate != null && (
              <> · constatés : <strong className="tabular-nums text-slate-800">{constate}</strong></>
            )}
          </p>
          {ecart && (
            <p className="mt-0.5 inline-flex items-center gap-1 font-semibold text-red-700">
              <OctagonAlert className="h-3.5 w-3.5" /> La liste dépasse ce qui a été vu
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[110px_150px_1fr_1.5fr_auto]">
        <input
          type="number" min={0} className="input text-sm" placeholder="Constatés"
          aria-label={`Effectif constaté — ${v.title}`}
          value={saisie.effectif_constate} onChange={champ("effectif_constate")}
        />
        <input
          type="date" className="input text-sm" aria-label={`Date de la visite — ${v.title}`}
          value={saisie.visite_le} onChange={champ("visite_le")}
        />
        <input
          type="text" className="input text-sm" placeholder="Agent" aria-label={`Agent — ${v.title}`}
          value={saisie.visiteur} onChange={champ("visiteur")}
        />
        <input
          type="text" className="input text-sm" placeholder="Observations" aria-label={`Observations — ${v.title}`}
          value={saisie.commentaire} onChange={champ("commentaire")}
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={!modifie || enCours}
            onClick={async () => { setEnCours(true); await onEnregistrer(v, saisie); setEnCours(false); }}
            className="btn-primary text-sm disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => onRetirer(v)}
            className="icon-btn icon-btn-danger h-9 w-9"
            aria-label={`Retirer ${v.title} des visites`}
            title="Retirer du tirage"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

export default function VisitesInopinees() {
  const toast = useToast();
  const confirm = useConfirm();
  const [visites, setVisites] = useState(null);
  const [tirage, setTirage] = useState({ nombre: 3, jours: 30 });

  const charger = useCallback(async () => {
    try {
      const res = await api.get("/controle/visites");
      setVisites(res.data);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Impossible de charger les visites.");
    }
  }, [toast]);
  useEffect(() => { charger(); }, [charger]);

  const tirer = async () => {
    try {
      const res = await api.post("/controle/visites/tirage", tirage);
      toast.success(
        res.data.tirees
          ? `${res.data.tirees} activité${res.data.tirees > 1 ? "s" : ""} tirée${res.data.tirees > 1 ? "s" : ""} au hasard.`
          : "Aucune activité à venir à tirer dans cette fenêtre."
      );
      await charger();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Le tirage n'a pas abouti.");
    }
  };

  const enregistrer = async (v, saisie) => {
    try {
      await api.patch(`/controle/visites/${v.id}`, saisie);
      toast.success("Visite enregistrée.");
      await charger();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Enregistrement impossible.");
    }
  };

  const retirer = async (v) => {
    const ok = await confirm({
      title: "Retirer cette visite ?",
      body: `« ${v.title} » ne sera plus à visiter. Ce qui a été noté sera perdu.`,
      confirmLabel: "Retirer",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/controle/visites/${v.id}`);
      await charger();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Impossible de retirer la visite.");
    }
  };

  return (
    <div className="space-y-4">
      <section className="card-solid space-y-3 p-4" aria-labelledby="titre-visites">
        <div className="flex items-start gap-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <div className="text-sm text-slate-600">
            <h2 id="titre-visites" className="font-semibold text-slate-900">Tirer des activités à visiter</h2>
            <p>
              Parmi les activités en présentiel des partenaires prévues dans la fenêtre choisie. Un agent y passe sans
              prévenir et note l&apos;effectif qu&apos;il constate ; si la liste déclarée le dépasse nettement, une
              alerte apparaît sur l&apos;activité dans la validation.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nombre
            <input
              type="number" min={1} max={20} className="input mt-1 w-20"
              value={tirage.nombre}
              onChange={(e) => setTirage((t) => ({ ...t, nombre: Number(e.target.value) }))}
            />
          </label>
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Dans les prochains
            <span className="mt-1 flex items-center gap-1">
              <input
                type="number" min={1} max={90} className="input w-20"
                value={tirage.jours}
                onChange={(e) => setTirage((t) => ({ ...t, jours: Number(e.target.value) }))}
              />
              <span className="text-sm normal-case text-slate-500">jours</span>
            </span>
          </label>
          <button type="button" onClick={tirer} className="btn-primary">
            <Shuffle className="h-4 w-4" />
            Tirer au hasard
          </button>
        </div>
      </section>

      {visites && visites.length === 0 && (
        <div className="card-solid p-10 text-center text-sm text-slate-500">Aucune visite tirée pour l&apos;instant.</div>
      )}
      {visites && visites.length > 0 && (
        <ul className="space-y-2">
          {visites.map((v) => (
            <LigneVisite key={`${v.id}-${v.effectif_constate}-${v.visite_le}`} v={v} onEnregistrer={enregistrer} onRetirer={retirer} />
          ))}
        </ul>
      )}
    </div>
  );
}
