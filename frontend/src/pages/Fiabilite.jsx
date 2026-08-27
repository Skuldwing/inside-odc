import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Copy,
  Settings2,
  Users,
  FileCheck,
  ListChecks,
  AlertTriangle,
  Table,
} from "lucide-react";
import api from "../api";

const CRITERIA_META = {
  participants: { label: "Liste participants", icon: Users },
  proof: { label: "Preuve justificative", icon: FileCheck },
  metadata: { label: "Métadonnées", icon: ListChecks },
  duplicates: { label: "Absence de doublons", icon: Copy },
};

const CRITERIA_ORDER = ["participants", "proof", "metadata", "duplicates"];

function scoreColor(score) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function scoreTextColor(score) {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function ParticipantsCriterionNote({ c }) {
  if (!c.has_real_list) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-600">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        Effectif estimé — aucune liste réelle importée
      </p>
    );
  }
  const gaps = [];
  if (c.missing_email > 0) gaps.push(`${c.missing_email} sans email`);
  if (c.missing_telephone > 0) gaps.push(`${c.missing_telephone} sans téléphone`);
  if (c.missing_genre > 0) gaps.push(`${c.missing_genre} sans genre`);
  if (c.missing_structure > 0) gaps.push(`${c.missing_structure} sans structure`);
  if (gaps.length === 0) return null;
  return (
    <p className="mt-1 text-[11px] text-slate-500">
      Sur {c.real_count} participant{c.real_count !== 1 ? "s" : ""} : {gaps.join(" · ")}
    </p>
  );
}

function DuplicatesCriterionNote({ c, duplicateOfTitle }) {
  if (!c.duplicate_of) return null;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-red-600">
      <AlertTriangle className="w-3 h-3 shrink-0" />
      Doublon potentiel avec « {duplicateOfTitle || `activité #${c.duplicate_of}`} » —
      même partenaire/coach, même date
    </p>
  );
}

function ScoreBreakdown({ details, duplicateOfTitle }) {
  const criteria = details?.criteria || {};
  return (
    <div className="space-y-2.5">
      {CRITERIA_ORDER.map((key) => {
        const c = criteria[key];
        if (!c) return null;
        const meta = CRITERIA_META[key];
        const Icon = meta.icon;
        return (
          <div key={key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1.5 text-slate-600">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                {meta.label}
                <span className="text-slate-400">({Math.round(c.weight * 100)}%)</span>
              </span>
              <span className={`font-semibold ${scoreTextColor(c.score)}`}>{c.score}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${scoreColor(c.score)} transition-all duration-500`}
                style={{ width: `${c.score}%` }}
              />
            </div>
            {key === "participants" && <ParticipantsCriterionNote c={c} />}
            {key === "duplicates" && <DuplicatesCriterionNote c={c} duplicateOfTitle={duplicateOfTitle} />}
          </div>
        );
      })}
    </div>
  );
}

function ParticipantsList({ activityId }) {
  const [participants, setParticipants] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .get(`/reliability/${activityId}/participants`)
      .then((res) => { if (mounted) setParticipants(res.data); })
      .catch(() => { if (mounted) setParticipants([]); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [activityId]);

  if (loading) {
    return <p className="text-xs text-slate-400 py-2">Chargement de la liste...</p>;
  }

  if (!participants || participants.length === 0) {
    return (
      <p className="text-xs text-slate-400 py-2">
        Aucune liste nominative importée pour cette activité — uniquement un effectif estimé.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table text-xs">
        <thead className="table-head">
          <tr>
            <th className="px-2 py-1.5">Nom</th>
            <th className="px-2 py-1.5">Téléphone</th>
            <th className="px-2 py-1.5">Email</th>
            <th className="px-2 py-1.5">Structure</th>
          </tr>
        </thead>
        <tbody>
          {participants.map((p) => (
            <tr key={p.id} className="table-row">
              <td className="px-2 py-1.5 text-slate-700">{p.prenom} {p.nom}</td>
              <td className="px-2 py-1.5">
                {p.telephone
                  ? <span className="text-slate-600">{p.telephone}</span>
                  : <span className="text-red-500 italic">manquant</span>}
              </td>
              <td className="px-2 py-1.5">
                {p.email
                  ? <span className="text-slate-600">{p.email}</span>
                  : <span className="text-red-500 italic">manquant</span>}
              </td>
              <td className="px-2 py-1.5 text-slate-500">{p.structure || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActivityRow({ activity, onValidate, onReject, busy }) {
  const [expanded, setExpanded] = useState(false);
  const [showList, setShowList] = useState(false);
  const score = Number(activity.reliability_score ?? 0);
  const hasRealList = activity.reliability_details?.criteria?.participants?.has_real_list;

  return (
    <div className="anim-fade-in-up card-solid p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900">{activity.title}</p>
            <span className="badge bg-slate-100 border-slate-200 text-slate-600 text-[11px]">
              {activity.mode === "ligne" ? "En ligne" : "Présentiel"}
            </span>
            {hasRealList === false && (
              <span
                className="badge bg-amber-50 border-amber-200 text-amber-700 text-[11px]"
                title="Aucune liste nominative importée — effectif estimé uniquement"
              >
                Effectif estimé{activity.participants_manual != null ? ` (~${activity.participants_manual})` : ""}
              </span>
            )}
            {activity.duplicate_of && (
              <span
                className="badge bg-violet-50 border-violet-200 text-violet-700 text-[11px]"
                title={`Doublon potentiel de : ${activity.duplicate_of_title}`}
              >
                Doublon potentiel
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {activity.partner_name || activity.coach_name || "—"} ·{" "}
            {activity.activity_date
              ? format(parseISO(activity.activity_date), "dd/MM/yyyy", { locale: fr })
              : "—"}{" "}
            · {activity.participants_count} participant{activity.participants_count !== 1 ? "s" : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
            >
              {expanded ? "Masquer le détail" : "Voir le détail du score"}
            </button>
            <button
              onClick={() => setShowList((s) => !s)}
              className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium"
            >
              <Table className="w-3 h-3" />
              {showList ? "Masquer la liste" : "Voir la liste des participants"}
            </button>
          </div>
          {expanded && (
            <div className="mt-3 max-w-md rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <ScoreBreakdown details={activity.reliability_details} duplicateOfTitle={activity.duplicate_of_title} />
            </div>
          )}
          {showList && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <ParticipantsList activityId={activity.id} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className={`text-2xl font-bold ${scoreTextColor(score)}`}>{score.toFixed(0)}%</p>
            <p className="text-xs text-slate-400">Fiabilité</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onValidate(activity.id)}
              disabled={busy}
              className="btn bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Valider
            </button>
            <button
              onClick={() => onReject(activity.id)}
              disabled={busy}
              className="btn bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Rejeter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Fiabilite() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [threshold, setThreshold] = useState(60);
  const [thresholdInput, setThresholdInput] = useState("60");
  const [savingThreshold, setSavingThreshold] = useState(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/reliability/queue");
      setQueue(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await api.get("/reliability/settings");
      setThreshold(res.data.threshold);
      setThresholdInput(String(res.data.threshold));
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    fetchSettings();
  }, [fetchQueue, fetchSettings]);

  const handleValidate = async (id) => {
    setBusyId(id);
    try {
      await api.patch(`/reliability/${id}/validate`);
      setQueue((q) => q.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id) => {
    setBusyId(id);
    try {
      await api.patch(`/reliability/${id}/reject`);
      setQueue((q) => q.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
    } finally {
      setBusyId(null);
    }
  };

  const saveThreshold = async () => {
    const value = Number(thresholdInput);
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    setSavingThreshold(true);
    try {
      await api.put("/reliability/settings", { threshold: value });
      setThreshold(value);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingThreshold(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-orange-500" />
            Fiabilité des données
          </h1>
          <p className="page-subtitle">
            Activités partenaires à vérifier avant qu'elles comptent dans les KPIs officiels
          </p>
        </div>
        <button onClick={fetchQueue} className="btn btn-ghost gap-2" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </button>
      </div>

      <div className="card-solid p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Settings2 className="w-4 h-4 text-slate-400" />
          <p className="text-sm text-slate-600">
            Seuil de validation automatique : une activité passe en <strong>validée</strong> dès que
            son score de fiabilité atteint ce seuil.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              className="input w-24 text-sm"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
            />
            <span className="text-sm text-slate-400">%</span>
            <button
              onClick={saveThreshold}
              disabled={savingThreshold || Number(thresholdInput) === threshold}
              className="btn-primary text-sm disabled:opacity-50"
            >
              {savingThreshold ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {loading
          ? "Chargement..."
          : `${queue.length} activité${queue.length !== 1 ? "s" : ""} à vérifier`}
      </p>

      <div className="space-y-3">
        {!loading && queue.length === 0 && (
          <div className="card-solid p-12 text-center text-sm text-slate-400">
            Rien à vérifier — toutes les activités déclarées sont au-dessus du seuil de fiabilité.
          </div>
        )}
        {queue.map((activity) => (
          <ActivityRow
            key={activity.id}
            activity={activity}
            onValidate={handleValidate}
            onReject={handleReject}
            busy={busyId === activity.id}
          />
        ))}
      </div>
    </div>
  );
}
