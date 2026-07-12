import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Clock, CheckCircle2, Award, AlertCircle, Send } from "lucide-react";
import api from "../api";

export default function VoteJury() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [juryInfo, setJuryInfo] = useState(null);  // { token, pseudo, avatar }
  const [status, setStatus] = useState(null);       // data from /vote/jury/status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* local scores: { [criteriaId]: { score, comment } } */
  const [scores, setScores] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const intervalRef = useRef(null);
  const currentProjectIdRef = useRef(null);

  useEffect(() => {
    const raw = localStorage.getItem(`vote_jury_${sessionId}`);
    if (!raw) {
      navigate(`/vote/join/${sessionId}`, { replace: true });
      return;
    }
    try {
      setJuryInfo(JSON.parse(raw));
    } catch {
      localStorage.removeItem(`vote_jury_${sessionId}`);
      navigate(`/vote/join/${sessionId}`, { replace: true });
    }
  }, [sessionId, navigate]);

  const poll = useCallback(async () => {
    if (!juryInfo?.token) return;
    try {
      const r = await api.get("/vote/jury/status", { headers: { "X-Jury-Token": juryInfo.token } });
      const d = r.data;
      setStatus(d);
      setLoading(false);

      /* Reset scores when project changes (use ref to avoid interval recreation) */
      const newProjId = d.active_project?.id || null;
      if (newProjId !== currentProjectIdRef.current) {
        currentProjectIdRef.current = newProjId;
        setSubmitted(false);
        setSubmitError("");
        if (d.active_project && d.criteria) {
          const init = {};
          d.criteria.forEach(c => {
            if (d.my_scores?.[c.id]) {
              init[c.id] = { score: d.my_scores[c.id].score, comment: d.my_scores[c.id].comment || "" };
            } else {
              init[c.id] = { score: Math.ceil(c.scale / 2), comment: "" };
            }
          });
          setScores(init);
          const allVoted = d.criteria.every(c => d.my_scores?.[c.id]);
          setSubmitted(allVoted);
        } else {
          setScores({});
        }
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem(`vote_jury_${sessionId}`);
        navigate(`/vote/join/${sessionId}`, { replace: true });
      } else {
        setError("Probleme de connexion...");
      }
    }
  }, [juryInfo, sessionId, navigate]);

  useEffect(() => {
    if (!juryInfo) return;
    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, [juryInfo, poll]);

  const setScore = (criteriaId, score) => {
    setScores(s => ({ ...s, [criteriaId]: { ...(s[criteriaId] || {}), score } }));
  };

  const setComment = (criteriaId, comment) => {
    setScores(s => ({ ...s, [criteriaId]: { ...(s[criteriaId] || {}), comment } }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!status?.active_project) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const payload = status.criteria.map(c => ({
        criteria_id: c.id,
        score: scores[c.id]?.score ?? Math.ceil(c.scale / 2),
        comment: scores[c.id]?.comment || "",
      }));
      await api.post("/vote/jury/scores",
        { project_id: status.active_project.id, scores: payload },
        { headers: { "X-Jury-Token": juryInfo.token } }
      );
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err?.response?.data?.error || "Erreur lors de l'envoi.");
    }
    setSubmitting(false);
  };

  /* ── Render states ── */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  if (status?.session_status === "closed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-white px-4 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-400 mb-4" />
        <p className="text-2xl font-bold text-slate-900 mb-2">Session terminee</p>
        <p className="text-slate-500 text-sm">Merci pour votre participation, {juryInfo?.pseudo} !</p>
        <p className="mt-8 text-xs text-slate-400">Orange Digital Center Senegal</p>
      </div>
    );
  }

  if (!status?.active_project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 to-white px-4 text-center">
        <div className="text-5xl mb-4">{juryInfo?.avatar || "🧑"}</div>
        <p className="text-lg font-semibold text-slate-800 mb-1">Bonjour {juryInfo?.pseudo} !</p>
        <div className="flex items-center gap-2 text-slate-500 text-sm mt-3">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>En attente du prochain projet...</span>
        </div>
        <p className="text-xs text-slate-400 mt-8">L&apos;administrateur lancera le vote sous peu</p>
        <p className="mt-2 text-xs text-slate-400">Orange Digital Center Senegal</p>
      </div>
    );
  }

  const proj = status.active_project;
  const criteria = status.criteria || [];
  const hasAllScores = criteria.every(c => scores[c.id]?.score != null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-8">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">{juryInfo?.avatar || "🧑"}</div>
          <p className="text-xs uppercase tracking-widest text-orange-500 font-semibold mb-1">Notation</p>
          <h1 className="text-xl font-bold text-slate-900">{proj.name}</h1>
          {proj.porteur && <p className="text-sm text-slate-500 mt-0.5">{proj.porteur}</p>}
          {proj.description && (
            <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto">{proj.description}</p>
          )}
        </div>

        {submitted ? (
          /* Already voted — show summary */
          <div className="rounded-2xl bg-white border border-green-200 shadow-sm p-5 mb-4">
            <div className="flex items-center gap-2 text-green-600 mb-3">
              <CheckCircle2 className="w-5 h-5" />
              <p className="font-semibold text-sm">Votes enregistres !</p>
            </div>
            <p className="text-xs text-slate-500 mb-4">En attente de la fin des votes pour ce projet.</p>
            <div className="space-y-2">
              {criteria.map(c => {
                const s = scores[c.id];
                return (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate flex-1">{c.name}</span>
                    <span className="font-bold text-orange-600 ml-3">{s?.score ?? "—"} / {c.scale}</span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setSubmitted(false)}
              className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Modifier mes notes
            </button>
          </div>
        ) : (
          /* Voting form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {criteria.map(c => {
              const val = scores[c.id]?.score ?? Math.ceil(c.scale / 2);
              const comment = scores[c.id]?.comment || "";
              return (
                <div key={c.id} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-sm text-slate-800">{c.name}</p>
                    <span className="text-xl font-bold text-orange-500">{val}<span className="text-slate-400 text-sm font-normal"> / {c.scale}</span></span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={c.scale}
                    step={1}
                    value={val}
                    onChange={e => setScore(c.id, Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>1</span>
                    <span>{c.scale}</span>
                  </div>
                  <details className="mt-3">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                      + Ajouter un commentaire
                    </summary>
                    <textarea
                      rows={2}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-orange-400 focus:outline-none resize-none"
                      placeholder="Commentaire optionnel..."
                      value={comment}
                      onChange={e => setComment(c.id, e.target.value)}
                    />
                  </details>
                </div>
              );
            })}

            {submitError && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {submitError}
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Envoi...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Send className="w-5 h-5" /> Envoyer mes notes
                </span>
              )}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-400 py-4">Orange Digital Center Senegal</p>
      </div>
    </div>
  );
}
