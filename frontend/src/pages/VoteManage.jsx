import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Play, Square, CheckCircle2, Clock, Users, Loader2, BarChart3, Trophy,
} from "lucide-react";
import api from "../api";

const PROJ_STATUS = {
  pending: { label: "En attente", cls: "bg-slate-100 text-slate-600" },
  active:  { label: "En cours",   cls: "bg-orange-100 text-orange-700" },
  closed:  { label: "Vote ferme", cls: "bg-green-100 text-green-700"  },
};

export default function VoteManage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const [activating, setActivating] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState(null);
  const intervalRef = useRef(null);

  const fetchLive = useCallback(async () => {
    try {
      const r = await api.get(`/vote/sessions/${id}/live`);
      setData(r.data);
      if (loading) setLoading(false);
    } catch {
      setError("Impossible de charger les donnees.");
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
    if (!confirm("Terminer la session de vote ? Les resultats seront finalises.")) return;
    try {
      await api.put(`/vote/sessions/${id}/close`);
      await fetchLive();
    } catch { setError("Erreur."); }
  };

  const loadResults = async () => {
    try {
      const r = await api.get(`/vote/sessions/${id}/results`);
      setResults(r.data);
      setShowResults(true);
    } catch { setError("Erreur chargement resultats."); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>;

  const session = data?.session;
  const projects = data?.projects || [];
  const activeProj = data?.active_project;
  const jury = data?.jury || [];
  const criteria = data?.criteria || [];
  const votedCount = data?.voted_count || 0;
  const juryTotal = data?.jury_total || 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/vote/${id}`)} className="rounded-xl p-2 hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{session?.name}</h1>
          <p className="text-sm text-slate-500">{juryTotal} jure{juryTotal !== 1 ? "s" : ""} connecte{juryTotal !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadResults} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            <BarChart3 className="w-3.5 h-3.5" /> Resultats
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 flex items-center gap-2"><Trophy className="w-5 h-5 text-orange-500" /> Resultats</h3>
              <button onClick={() => setShowResults(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-5 space-y-3">
              {results.ranking.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 rounded-xl p-3 ${i === 0 ? "bg-orange-50 border border-orange-200" : "bg-slate-50 border border-slate-100"}`}>
                  <span className={`text-lg font-bold w-6 text-center ${i === 0 ? "text-orange-500" : "text-slate-400"}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-slate-900">{p.name}</p>
                    {p.porteur && <p className="text-xs text-slate-500">{p.porteur}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{p.weighted_avg}</p>
                    <p className="text-xs text-slate-400">{p.voter_count} vote{p.voter_count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
              {results.ranking.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Aucun vote enregistre</p>}
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

              {/* Vote progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Votes recus</span>
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
              <p className="text-xs mt-1">Selectionnez un projet a gauche</p>
            </div>
          )}
        </div>

        {/* Right: jury list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-3">Jures ({juryTotal})</h2>
          {jury.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">En attente des jures</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jury.map(j => (
                <div key={j.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${j.voted ? "border-green-100 bg-green-50" : "border-slate-100 bg-slate-50"}`}>
                  <span className="text-xl leading-none">{j.avatar}</span>
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
