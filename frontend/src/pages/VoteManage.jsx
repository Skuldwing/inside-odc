import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Play, Square, CheckCircle2, Clock, Users, Loader2, BarChart3, Trophy,
  MessageCircleQuestion, Download, X, StopCircle, Monitor,
} from "lucide-react";
import api from "../api";

/* Timer SVG circulaire — partagé avec VoteJury */
function PitchTimer({ startedAt, stoppedAt, durationMinutes, label }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!startedAt || !durationMinutes) return;
    const endMs = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;
    if (stoppedAt) {
      // Timer gelé : on calcule le temps restant au moment du stop
      setTimeLeft(Math.round((endMs - new Date(stoppedAt).getTime()) / 1000));
      return;
    }
    const calc = () => Math.round((endMs - Date.now()) / 1000);
    setTimeLeft(calc());
    const iv = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(iv);
  }, [startedAt, stoppedAt, durationMinutes]);

  if (timeLeft === null) return null;

  const isQa    = !!label;
  const elapsed = timeLeft <= 0;
  const urgent  = !elapsed && timeLeft <= 10;
  const warning = !elapsed && timeLeft <= 30;

  const R    = 38;
  const circ = 2 * Math.PI * R;
  const pct  = Math.max(0, Math.min(1, timeLeft / (durationMinutes * 60)));
  const dashOffset = circ * (1 - pct);
  const stroke = elapsed ? "#ef4444" : warning ? "#f59e0b" : isQa ? "#a855f7" : "#f97316";

  const mins = Math.floor(Math.abs(timeLeft) / 60);
  const secs = Math.abs(timeLeft) % 60;
  const fmt  = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className={`flex items-center gap-4 rounded-xl border px-4 py-3 mb-4 ${
      elapsed ? "border-red-200 bg-red-50"
      : warning ? "border-amber-200 bg-amber-50"
      : isQa   ? "border-purple-200 bg-purple-50"
      : "border-slate-200 bg-slate-50"
    } ${urgent ? "anim-timer-urgent" : ""}`}>
      {/* Cercle SVG compact */}
      <div className="relative flex-shrink-0" style={{ width: 88, height: 88 }}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={R} fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="44" cy="44" r={R}
            fill="none"
            stroke={stroke}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-base font-bold tabular-nums leading-none ${
            elapsed ? "text-red-600" : warning ? "text-amber-600" : isQa ? "text-purple-700" : "text-slate-800"
          }`}>
            {elapsed ? `+${fmt}` : fmt}
          </span>
        </div>
      </div>
      {/* Info textuelle */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {isQa ? "Q & R" : "Pitch"} · {durationMinutes} min
        </p>
        {elapsed
          ? <p className="text-sm font-bold text-red-600 mt-0.5">Temps écoulé</p>
          : warning
          ? <p className="text-sm font-semibold text-amber-600 mt-0.5">Moins de 30 secondes !</p>
          : <p className="text-sm text-slate-500 mt-0.5">En cours...</p>
        }
      </div>
    </div>
  );
}

const PROJ_STATUS = {
  pending: { label: "En attente", cls: "bg-slate-100 text-slate-600" },
  active:  { label: "En cours",   cls: "bg-orange-100 text-orange-700" },
  closed:  { label: "Vote fermé", cls: "bg-green-100 text-green-700"  },
};

export default function VoteManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [startingPitch, setStartingPitch] = useState(false);
  const [stoppingPitch, setStoppingPitch] = useState(false);
  const [startingQa, setStartingQa] = useState(false);
  const [stoppingQa, setStoppingQa] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const [resultsTab, setResultsTab] = useState("ranking");
  const [exportingPdf, setExportingPdf] = useState(false);
  const intervalRef = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      const r = await api.get(`/vote/sessions/${id}/live`);
      setData(r.data);
      if (loading) setLoading(false);
    } catch {
      setError("Impossible de charger les données.");
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchLive();
    intervalRef.current = setInterval(fetchLive, 3000);
    return () => clearInterval(intervalRef.current);
  }, [fetchLive]);

  const setActiveProject = async (projectId) => {
    if (activating) return;
    setActivating(true);
    try {
      await api.put(`/vote/sessions/${id}/active-project`, { project_id: projectId });
      await fetchLive();
    } catch { setError("Erreur lors du changement de projet."); }
    setActivating(false);
  };

  const closeProject = async () => {
    if (!confirm("Fermer les votes pour ce projet ?")) return;
    setClosing(true);
    try {
      await api.post(`/vote/sessions/${id}/close-project`);
      await fetchLive();
    } catch { setError("Erreur lors de la cloture."); }
    setClosing(false);
  };

  const closeSession = async () => {
    if (!confirm("Terminer la session de vote ? Les résultats seront finalisés.")) return;
    try {
      await api.put(`/vote/sessions/${id}/close`);
      await fetchLive();
    } catch { setError("Erreur."); }
  };

  const startPitch = async () => {
    setStartingPitch(true);
    try { await api.post(`/vote/sessions/${id}/start-pitch`); await fetchLive(); }
    catch { setError("Erreur démarrage timer pitch."); }
    setStartingPitch(false);
  };

  const stopPitch = async () => {
    setStoppingPitch(true);
    try { await api.post(`/vote/sessions/${id}/stop-pitch`); await fetchLive(); }
    catch { setError("Erreur arrêt timer pitch."); }
    setStoppingPitch(false);
  };

  const startQa = async () => {
    setStartingQa(true);
    try { await api.post(`/vote/sessions/${id}/start-qa`); await fetchLive(); }
    catch { setError("Erreur lors du lancement du Q&R."); }
    setStartingQa(false);
  };

  const stopQa = async () => {
    setStoppingQa(true);
    try { await api.post(`/vote/sessions/${id}/stop-qa`); await fetchLive(); }
    catch { setError("Erreur arrêt timer Q&R."); }
    setStoppingQa(false);
  };

  const loadResults = async () => {
    try {
      const r = await api.get(`/vote/sessions/${id}/results`);
      setResults(r.data);
      setResultsTab("ranking");
      setShowResults(true);
    } catch { setError("Erreur chargement résultats."); }
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      const r = await api.get(`/vote/sessions/${id}/results/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resultats-${session?.name || id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError("Erreur export PDF."); }
    setExportingPdf(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>;

  const session = data?.session;
  const projects = data?.projects || [];
  const activeProj = data?.active_project;
  const jury = data?.jury || [];
  const criteria = data?.criteria || [];
  const votedCount = data?.voted_count || 0;
  const juryTotal = data?.jury_total || 0;
  const pitchDuration = data?.pitch_duration_minutes ?? session?.pitch_duration_minutes ?? 5;
  const qaDuration = data?.qa_duration_minutes ?? session?.qa_duration_minutes ?? 5;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/vote/${id}`)} className="rounded-xl p-2 hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{session?.name}</h1>
          <p className="text-sm text-slate-500">{juryTotal} juré{juryTotal !== 1 ? "s" : ""} connecté{juryTotal !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/vote/project/${id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            title="Ouvrir la vue projecteur sur une autre machine"
          >
            <Monitor className="w-3.5 h-3.5" /> Projecteur
          </a>
          <button onClick={loadResults} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" /> Résultats
          </button>
          {session?.status === "active" && (
            <button onClick={closeSession} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
              <Square className="w-3.5 h-3.5" /> Terminer session
            </button>
          )}
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {/* Results modal */}
      {showResults && results && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: "88vh" }}>
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-orange-500" /> Résultats — {session?.name}
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={exportPdf} disabled={exportingPdf}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  PDF
                </button>
                <button onClick={() => setShowResults(false)} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-3 border-b border-slate-100 flex-shrink-0">
              {[
                { key: "ranking",  label: "Classement" },
                { key: "criteria", label: "Par critère" },
                { key: "jury",     label: "Par juré" },
              ].map(t => (
                <button key={t.key} onClick={() => setResultsTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${resultsTab === t.key ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* ── Onglet Classement ── */}
              {resultsTab === "ranking" && (
                <div className="space-y-3">
                  {results.ranking.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-3 rounded-xl p-4 border ${i === 0 ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-100"}`}>
                      <span className="text-2xl w-8 text-center">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                        {p.porteur && <p className="text-xs text-slate-500">{p.porteur}</p>}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl font-bold text-orange-600">{p.weighted_avg}</p>
                        <p className="text-xs text-slate-400">{p.voter_count} vote{p.voter_count !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  ))}
                  {results.ranking.length === 0 && <p className="text-sm text-slate-400 text-center py-6">Aucun vote enregistré</p>}
                </div>
              )}

              {/* ── Onglet Par critère ── */}
              {resultsTab === "criteria" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2 pr-4 font-semibold text-slate-700 min-w-[140px]">Projet</th>
                        {results.criteria.map(c => (
                          <th key={c.id} className="text-center py-2 px-3 font-semibold text-slate-700 min-w-[90px]">
                            {c.name}
                            <span className="block text-xs font-normal text-slate-400">/ {c.scale}</span>
                          </th>
                        ))}
                        <th className="text-center py-2 px-3 font-semibold text-orange-600 min-w-[80px]">Moy. pond.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.ranking.map((p, i) => (
                        <tr key={p.id} className={`border-b border-slate-100 ${i === 0 ? "bg-orange-50" : ""}`}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-base">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ""}</span>
                              <div>
                                <p className="font-medium text-slate-800 text-sm">{p.name}</p>
                                {p.porteur && <p className="text-xs text-slate-400">{p.porteur}</p>}
                              </div>
                            </div>
                          </td>
                          {p.criteria_scores.map(cs => (
                            <td key={cs.criteria_id} className="text-center py-3 px-3">
                              {cs.avg_score != null
                                ? <span className="font-semibold text-slate-800">{cs.avg_score.toFixed(1)}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          <td className="text-center py-3 px-3 font-bold text-orange-600">{p.weighted_avg}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Onglet Par juré ── */}
              {resultsTab === "jury" && (
                <div className="space-y-6">
                  {results.ranking.map((p, i) => (
                    <div key={p.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                        <h4 className="font-semibold text-slate-800">{p.name}</h4>
                        {p.porteur && <span className="text-xs text-slate-400">{p.porteur}</span>}
                      </div>
                      {p.jury_scores.length === 0 ? (
                        <p className="text-xs text-slate-400 italic pl-2">Aucun vote</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border border-slate-100 rounded-xl overflow-hidden">
                            <thead>
                              <tr className="bg-slate-50">
                                <th className="text-left py-2 px-3 font-semibold text-slate-600">Juré</th>
                                {results.criteria.map(c => (
                                  <th key={c.id} className="text-center py-2 px-2 font-semibold text-slate-600">{c.name}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {p.jury_scores.map(js => (
                                <tr key={js.jury_id} className="border-t border-slate-100">
                                  <td className="py-2 px-3 font-medium text-slate-800">
                                    <span className="mr-1">{js.avatar}</span>{js.pseudo}
                                  </td>
                                  {js.scores.map(s => (
                                    <td key={s.criteria_id} className="text-center py-2 px-2 text-slate-700">
                                      {s.score}
                                      {s.comment && (
                                        <span className="ml-1 text-[10px] text-slate-400" title={s.comment}>💬</span>
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left: projects list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Projets</h2>
          <div className="space-y-2">
            {projects.map(p => {
              const st = PROJ_STATUS[p.status] || PROJ_STATUS.pending;
              const isActive = activeProj?.id === p.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border px-3 py-2.5 transition-colors ${isActive ? "border-orange-300 bg-orange-50" : "border-slate-100 bg-slate-50 hover:bg-slate-100"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">{p.name}</p>
                      {p.porteur && <p className="text-xs text-slate-500 truncate">{p.porteur}</p>}
                    </div>
                    <span className={`text-xs rounded-full px-2 py-0.5 flex-shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  {session?.status === "active" && p.status !== "closed" && (
                    <div className="mt-2">
                      {isActive ? (
                        <button
                          onClick={closeProject}
                          disabled={closing}
                          className="w-full rounded-lg bg-green-500 text-white text-xs py-1.5 font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          {closing ? "..." : "Fermer les votes"}
                        </button>
                      ) : (
                        <button
                          onClick={() => setActiveProject(p.id)}
                          disabled={activating}
                          className="w-full rounded-lg border border-orange-300 text-orange-600 text-xs py-1.5 font-medium hover:bg-orange-50 disabled:opacity-50 transition-colors"
                        >
                          {activating ? "..." : "Lancer ce projet"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {projects.length === 0 && <p className="text-sm text-slate-400 italic">Aucun projet</p>}
          </div>
        </div>

        {/* Center: current status */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Projet en cours</h2>
          {activeProj ? (
            <div>
              <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 mb-4">
                <p className="font-bold text-slate-900">{activeProj.name}</p>
                {activeProj.porteur && <p className="text-sm text-slate-600 mt-0.5">{activeProj.porteur}</p>}
                {activeProj.description && <p className="text-xs text-slate-500 mt-2">{activeProj.description}</p>}
              </div>

              {/* ── Timer Pitch ── */}
              {activeProj.started_at ? (
                <div>
                  <PitchTimer
                    startedAt={activeProj.started_at}
                    stoppedAt={activeProj.pitch_stopped_at}
                    durationMinutes={pitchDuration}
                  />
                  {!activeProj.pitch_stopped_at && session?.status === "active" && (
                    <button onClick={stopPitch} disabled={stoppingPitch}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 text-red-600 text-xs py-2 font-medium hover:bg-red-50 disabled:opacity-50 transition-colors mb-3">
                      {stoppingPitch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                      Arrêter le timer pitch
                    </button>
                  )}
                </div>
              ) : (
                session?.status === "active" && (
                  <button onClick={startPitch} disabled={startingPitch}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-orange-300 text-orange-600 text-xs py-2.5 font-medium hover:bg-orange-50 disabled:opacity-50 transition-colors mb-4">
                    {startingPitch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Démarrer le timer pitch ({pitchDuration} min)
                  </button>
                )
              )}

              {/* ── Timer Q&R ── */}
              {activeProj.qa_started_at ? (
                <div>
                  <PitchTimer
                    startedAt={activeProj.qa_started_at}
                    stoppedAt={activeProj.qa_stopped_at}
                    durationMinutes={qaDuration}
                    label="Q & R"
                  />
                  {!activeProj.qa_stopped_at && session?.status === "active" && (
                    <button onClick={stopQa} disabled={stoppingQa}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 text-red-600 text-xs py-2 font-medium hover:bg-red-50 disabled:opacity-50 transition-colors mb-3">
                      {stoppingQa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                      Arrêter le timer Q&amp;R
                    </button>
                  )}
                </div>
              ) : (
                session?.status === "active" && (
                  <button onClick={startQa} disabled={startingQa}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-purple-200 text-purple-600 text-xs py-2.5 font-medium hover:bg-purple-50 disabled:opacity-50 transition-colors mb-4">
                    {startingQa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircleQuestion className="w-3.5 h-3.5" />}
                    Démarrer le timer Q&amp;R ({qaDuration} min)
                  </button>
                )
              )}

              {/* Vote progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Votes reçus</span>
                  <span className="font-semibold text-slate-900">{votedCount} / {juryTotal}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-orange-400 rounded-full transition-all"
                    style={{ width: juryTotal > 0 ? `${(votedCount / juryTotal) * 100}%` : "0%" }}
                  />
                </div>
              </div>

              {/* Criteria averages */}
              <div className="space-y-2">
                {criteria.map(c => (
                  <div key={c.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600 truncate">{c.name}</span>
                      <span className="font-semibold text-slate-800 ml-2">
                        {c.avg_score != null ? `${c.avg_score} / ${c.scale}` : "—"}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-orange-300 rounded-full transition-all"
                        style={{ width: c.avg_score != null ? `${(c.avg_score / c.scale) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <Clock className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Aucun projet actif</p>
              <p className="text-xs mt-1">Sélectionnez un projet à gauche</p>
            </div>
          )}
        </div>

        {/* Right: jury list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Jurés ({juryTotal})</h2>
          {jury.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">En attente des jurés</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jury.map(j => (
                <div key={j.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${j.voted ? "border-green-100 bg-green-50" : "border-slate-100 bg-slate-50"}`}>
                  {j.avatar?.startsWith("https://")
                    ? <img src={j.avatar} alt="" className="w-8 h-8 rounded-lg flex-shrink-0" />
                    : <span className="text-xl leading-none flex-shrink-0">{j.avatar || "🧑"}</span>
                  }
                  <span className="flex-1 text-sm font-medium text-slate-800 truncate">{j.pseudo}</span>
                  {j.voted
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                    : <Clock className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
