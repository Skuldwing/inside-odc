import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, Send, MessageCircleQuestion } from "lucide-react";
import api from "../api";

function Avatar({ src, className = "w-10 h-10 rounded-xl" }) {
  if (src?.startsWith("https://")) {
    return <img src={src} alt="" className={className} />;
  }
  return <span className={className + " flex items-center justify-center"}>{src || "🧑"}</span>;
}

/* Timer SVG circulaire */
function CircleTimer({ startedAt, stoppedAt, durationMinutes, label, size = "md" }) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!startedAt || !durationMinutes) return;
    const endMs = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;
    if (stoppedAt) {
      setTimeLeft(Math.round((endMs - new Date(stoppedAt).getTime()) / 1000));
      return;
    }
    const calc = () => Math.round((endMs - Date.now()) / 1000);
    setTimeLeft(calc());
    const iv = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(iv);
  }, [startedAt, stoppedAt, durationMinutes]);

  if (timeLeft === null) return null;

  const stopped = !!stoppedAt;
  const isQa    = !!label;
  const elapsed = timeLeft <= 0;
  const urgent  = !stopped && !elapsed && timeLeft <= 10;
  const warning = !stopped && !elapsed && timeLeft <= 30;

  const dim  = size === "sm" ? 80 : 112;
  const R    = size === "sm" ? 32 : 46;
  const sw   = size === "sm" ? 6  : 7;
  const cx   = size === "sm" ? 40 : 50;
  const cy   = size === "sm" ? 40 : 50;
  const vb   = `0 0 ${dim} ${dim}`;
  const circ = 2 * Math.PI * R;
  const pct  = Math.max(0, Math.min(1, timeLeft / (durationMinutes * 60)));
  const dashOffset = circ * (1 - pct);

  const stroke = stopped ? "#94a3b8"
    : elapsed  ? "#ef4444"
    : warning  ? "#f59e0b"
    : isQa     ? "#a855f7"
    : "#f97316";

  const mins = Math.floor(Math.abs(timeLeft) / 60);
  const secs = Math.abs(timeLeft) % 60;
  const fmt  = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className={`flex flex-col items-center mb-4 ${urgent ? "anim-timer-urgent" : ""}`}>
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg className="w-full h-full -rotate-90" viewBox={vb}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
          <circle
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${size === "sm" ? "text-base" : "text-xl"} font-bold tabular-nums leading-none ${
            stopped ? "text-slate-400" : elapsed ? "text-red-500" : warning ? "text-amber-500" : isQa ? "text-purple-700" : "text-slate-800"
          }`}>
            {elapsed ? `+${fmt}` : fmt}
          </span>
          <span className={`${size === "sm" ? "text-[9px]" : "text-[10px]"} text-slate-400 mt-0.5`}>
            {isQa ? "Q & R" : "Pitch"}
          </span>
        </div>
      </div>
      {stopped
        ? <p className="text-xs font-semibold text-slate-400 mt-1">⏹ Arrêté</p>
        : elapsed
        ? <p className="text-xs font-semibold text-red-500 mt-1">Temps écoulé</p>
        : null
      }
    </div>
  );
}

/* Boutons de score avec pop + vibration */
function ScoreInput({ value, scale, onChange }) {
  const [lastAnim, setLastAnim] = useState({ n: null, t: 0 });

  const handlePick = (n) => {
    onChange(n);
    setLastAnim({ n, t: Date.now() });
    if (navigator?.vibrate) navigator.vibrate(20);
  };

  if (scale <= 10) {
    return (
      <div className="grid gap-1.5 mt-3" style={{ gridTemplateColumns: `repeat(${scale}, minmax(0, 1fr))` }}>
        {Array.from({ length: scale }, (_, i) => i + 1).map(n => {
          const isSelected = value === n;
          const key = isSelected ? `s-${n}-${lastAnim.n === n ? lastAnim.t : 0}` : n;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handlePick(n)}
              className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                isSelected
                  ? "bg-orange-500 text-white shadow-md shadow-orange-200 anim-score-pop"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-500"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-3">
      <input
        type="range" min={1} max={scale} step={1} value={value}
        onChange={e => { onChange(Number(e.target.value)); if (navigator?.vibrate) navigator.vibrate(15); }}
        className="w-full accent-orange-500"
      />
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>1</span><span>{scale}</span>
      </div>
    </div>
  );
}

/* Overlay flash de succès */
function SuccessFlash({ pseudo }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm pointer-events-none">
      <div className="anim-success-pop flex flex-col items-center">
        <svg className="w-28 h-28" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#f97316" strokeWidth="5" opacity="0.12" />
          <circle
            cx="50" cy="50" r="45"
            fill="none" stroke="#f97316" strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="283" strokeDashoffset="283"
            style={{ animation: "circleGrow 0.5s ease forwards" }}
          />
          <polyline
            points="28,52 43,67 72,33"
            fill="none" stroke="#f97316" strokeWidth="5"
            strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="60" strokeDashoffset="60"
            style={{ animation: "checkDraw 0.4s 0.45s ease forwards" }}
          />
        </svg>
        <p className="text-xl font-bold text-slate-800 mt-2">Notes envoyées !</p>
        <p className="text-sm text-slate-400 mt-1">Bien joué {pseudo}</p>
      </div>
    </div>
  );
}

export default function VoteJury() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [juryInfo, setJuryInfo]       = useState(null);
  const [status, setStatus]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  const [scores, setScores]           = useState({});
  const [submitting, setSubmitting]   = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [juryResults, setJuryResults] = useState(null);

  const intervalRef        = useRef(null);
  const currentProjectIdRef = useRef(null);

  useEffect(() => {
    const raw = localStorage.getItem(`vote_jury_${sessionId}`);
    if (!raw) { navigate(`/vote/join/${sessionId}`, { replace: true }); return; }
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
      setError("");
      setLoading(false);

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
          setSubmitted(d.criteria.every(c => d.my_scores?.[c.id]));
        } else {
          setScores({});
        }
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem(`vote_jury_${sessionId}`);
        navigate(`/vote/join/${sessionId}`, { replace: true });
      } else {
        setError("Problème de connexion...");
      }
    }
  }, [juryInfo, sessionId, navigate]);

  useEffect(() => {
    if (!juryInfo) return;
    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, [juryInfo, poll]);

  const setScore   = (cid, score)   => setScores(s => ({ ...s, [cid]: { ...(s[cid] || {}), score } }));
  const setComment = (cid, comment) => setScores(s => ({ ...s, [cid]: { ...(s[cid] || {}), comment } }));

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
      await api.post(
        "/vote/jury/scores",
        { project_id: status.active_project.id, scores: payload },
        { headers: { "X-Jury-Token": juryInfo.token } }
      );
      setSubmitted(true);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1700);
      if (navigator?.vibrate) navigator.vibrate([60, 40, 100]);
    } catch (err) {
      setSubmitError(err?.response?.data?.error || "Erreur lors de l'envoi.");
    }
    setSubmitting(false);
  };

  useEffect(() => {
    if (status?.session_status === "closed" && juryInfo?.token && !juryResults) {
      api.get(`/vote/sessions/${sessionId}/jury-results`, { headers: { "X-Jury-Token": juryInfo.token } })
        .then(r => setJuryResults(r.data))
        .catch(() => {});
    }
  }, [status?.session_status, juryInfo, sessionId, juryResults]);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  /* ── Session terminée → classement ── */
  if (status?.session_status === "closed") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6 anim-fade-in-up">
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto mb-3" />
            <p className="text-2xl font-bold text-slate-900 mb-1">Session terminée</p>
            <p className="text-slate-500 text-sm">Merci {juryInfo?.pseudo} ! Voici le classement final.</p>
          </div>
          {juryResults ? (
            <div className="space-y-3">
              {juryResults.ranking.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-2xl p-4 border shadow-sm anim-fade-in-up ${
                    i === 0 ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200"
                  }`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className="text-2xl">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    {p.porteur && <p className="text-xs text-slate-500">{p.porteur}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-orange-600">{p.weighted_avg}</p>
                    <p className="text-xs text-slate-400">{p.voter_count} vote{p.voter_count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
            </div>
          )}
          <p className="text-center text-xs text-slate-400 mt-8">Orange Digital Center Sénégal</p>
        </div>
      </div>
    );
  }

  /* ── En attente d'un projet ── */
  if (!status?.active_project) {
    const juryList     = status?.jury_list || [];
    const projectCount = status?.project_count || 0;
    const closedCount  = status?.closed_count || 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6 anim-fade-in-up">
            <Avatar src={juryInfo?.avatar} className="w-20 h-20 rounded-2xl mx-auto mb-2 border border-slate-100" />
            <p className="text-lg font-semibold text-slate-800">{juryInfo?.pseudo}</p>
            <p className="text-xs text-slate-400 mt-0.5">Membre du jury</p>
          </div>

          {juryList.length > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-3 anim-fade-in-up" style={{ animationDelay: "80ms" }}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Jurés connectés ({juryList.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {juryList.map((j, idx) => (
                  <div
                    key={j.id}
                    className="flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 anim-avatar-pop"
                    style={{ animationDelay: `${idx * 55}ms` }}
                  >
                    <Avatar src={j.avatar} className="w-5 h-5 rounded-full" />
                    <span className="text-xs text-slate-700 font-medium">{j.pseudo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {projectCount > 0 && (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-5 anim-fade-in-up" style={{ animationDelay: "160ms" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Projets</p>
                <span className="text-xs font-semibold text-orange-600">{closedCount} / {projectCount}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-orange-400 rounded-full transition-all duration-700"
                  style={{ width: projectCount > 0 ? `${(closedCount / projectCount) * 100}%` : "0%" }}
                />
              </div>
            </div>
          )}

          <div className="text-center anim-fade-in-up" style={{ animationDelay: "240ms" }}>
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>En attente du prochain projet...</span>
            </div>
            <p className="text-xs text-slate-400 mt-6">L&apos;administrateur lancera le vote sous peu</p>
            <p className="mt-2 text-xs text-slate-400">Orange Digital Center Sénégal</p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Projet actif ── */
  const proj         = status.active_project;
  const criteria     = status.criteria || [];
  const projectIndex = status.project_index;
  const projectCount = status.project_count;
  const votedCount   = status.voted_count || 0;
  const juryTotal    = status.jury_total || 0;
  const juryList     = status.jury_list || [];

  return (
    <>
      {showSuccess && <SuccessFlash pseudo={juryInfo?.pseudo} />}

      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-8">
        <div className="max-w-md mx-auto">

          {/* Header */}
          <div className="text-center mb-4 anim-fade-in-up">
            <Avatar src={juryInfo?.avatar} className="w-16 h-16 rounded-2xl mx-auto mb-2 border border-slate-100" />
            {projectIndex && projectCount && (
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-500 bg-orange-50 border border-orange-200 rounded-full px-3 py-1 mb-2">
                Projet {projectIndex} sur {projectCount}
              </div>
            )}
            <h1 className="text-xl font-bold text-slate-900">{proj.name}</h1>
            {proj.porteur && <p className="text-sm text-slate-500 mt-0.5">{proj.porteur}</p>}
            {proj.description && (
              <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto">{proj.description}</p>
            )}
          </div>

          {/* Timers */}
          {proj.started_at && (
            <CircleTimer startedAt={proj.started_at} stoppedAt={proj.pitch_stopped_at} durationMinutes={status.pitch_duration_minutes} />
          )}
          {proj.qa_started_at && (
            <CircleTimer startedAt={proj.qa_started_at} stoppedAt={proj.qa_stopped_at} durationMinutes={status.qa_duration_minutes} label="Q & R" />
          )}

          {submitted ? (
            <div key={`done-${proj.id}`} className="space-y-3 anim-fade-in-up">
              {/* Résumé votes */}
              <div className="rounded-2xl bg-white border border-green-200 shadow-sm p-5">
                <div className="flex items-center gap-2 text-green-600 mb-3">
                  <CheckCircle2 className="w-5 h-5" />
                  <p className="font-semibold text-sm">Votes enregistrés !</p>
                </div>
                <div className="space-y-2 mb-4">
                  {criteria.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600 truncate flex-1">{c.name}</span>
                      <span className="font-bold text-orange-600 ml-3">{scores[c.id]?.score ?? "—"} / {c.scale}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setSubmitted(false)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Modifier mes notes
                </button>
              </div>

              {/* Progression des votes du jury */}
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Jurés ayant voté</p>
                  <span className="text-xs font-semibold text-slate-800">{votedCount} / {juryTotal}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                  <div
                    className="h-full bg-orange-400 rounded-full transition-all duration-700"
                    style={{ width: juryTotal > 0 ? `${(votedCount / juryTotal) * 100}%` : "0%" }}
                  />
                </div>
                {juryList.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {juryList.map((j, idx) => (
                      <div
                        key={j.id}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 border text-xs font-medium transition-all duration-300 ${
                          j.voted
                            ? "bg-green-50 border-green-200 text-green-700"
                            : "bg-slate-50 border-slate-100 text-slate-400"
                        }`}
                        style={j.voted ? { animationDelay: `${idx * 40}ms` } : {}}
                      >
                        <Avatar src={j.avatar} className="w-5 h-5 rounded-full" />
                        <span>{j.pseudo}</span>
                        {j.voted && <CheckCircle2 className="w-3 h-3" />}
                      </div>
                    ))}
                  </div>
                )}
                {juryTotal > 0 && votedCount < juryTotal && (
                  <p className="text-xs text-slate-400 mt-2">
                    En attente de {juryTotal - votedCount} juré{juryTotal - votedCount > 1 ? "s" : ""}...
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* Formulaire de notation */
            <form key={`form-${proj.id}`} onSubmit={handleSubmit} className="space-y-4 anim-fade-in-up">
              {criteria.map((c, idx) => {
                const val     = scores[c.id]?.score ?? Math.ceil(c.scale / 2);
                const comment = scores[c.id]?.comment || "";
                return (
                  <div
                    key={c.id}
                    className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm anim-fade-in-up"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-800">{c.name}</p>
                        {c.description && (
                          <p className="text-xs text-slate-500 mt-0.5 leading-snug">{c.description}</p>
                        )}
                      </div>
                      <span className="text-xl font-bold text-orange-500 flex-shrink-0">
                        {val}<span className="text-slate-400 text-sm font-normal"> / {c.scale}</span>
                      </span>
                    </div>
                    <ScoreInput value={val} scale={c.scale} onChange={score => setScore(c.id, score)} />
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
                className="w-full rounded-2xl bg-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

          <p className="text-center text-xs text-slate-400 py-4">Orange Digital Center Sénégal</p>
        </div>
      </div>
    </>
  );
}
