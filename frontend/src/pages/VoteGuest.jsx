import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2, CheckCircle2, AlertCircle, Trophy, ExternalLink,
  ListOrdered, ChevronUp, ChevronDown, RotateCcw, Send,
} from "lucide-react";
import api from "../api";

function Avatar({ src, className = "w-10 h-10 rounded-xl" }) {
  if (src?.startsWith("https://")) {
    return <img src={src} alt="" className={className} />;
  }
  return <span className={className + " flex items-center justify-center text-2xl"}>{src || "🎓"}</span>;
}

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

  const isQa    = !!label;
  const elapsed = timeLeft <= 0;
  const urgent  = !elapsed && timeLeft <= 10;
  const warning = !elapsed && timeLeft <= 30;

  const dim  = size === "sm" ? 80 : 112;
  const R    = size === "sm" ? 32 : 46;
  const sw   = size === "sm" ? 6  : 7;
  const cx   = size === "sm" ? 40 : 56;
  const cy   = size === "sm" ? 40 : 56;
  const vb   = `0 0 ${dim} ${dim}`;
  const circ = 2 * Math.PI * R;
  const pct  = Math.max(0, Math.min(1, timeLeft / (durationMinutes * 60)));
  const dashOffset = circ * (1 - pct);

  const stroke = elapsed ? "#ef4444" : warning ? "#f59e0b" : isQa ? "#a855f7" : "#f97316";

  const mins = Math.floor(Math.abs(timeLeft) / 60);
  const secs = Math.abs(timeLeft) % 60;
  const fmt  = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className={`flex flex-col items-center mb-3 ${urgent ? "anim-timer-urgent" : ""}`}>
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg className="w-full h-full -rotate-90" viewBox={vb}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
          <circle
            cx={cx} cy={cy} r={R}
            fill="none" stroke={stroke} strokeWidth={sw}
            strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${size === "sm" ? "text-base" : "text-xl"} font-bold tabular-nums leading-none ${
            elapsed ? "text-red-500" : warning ? "text-amber-500" : isQa ? "text-purple-700" : "text-slate-800"
          }`}>
            {elapsed ? `+${fmt}` : fmt}
          </span>
          <span className={`${size === "sm" ? "text-[9px]" : "text-[10px]"} text-slate-400 mt-0.5`}>
            {isQa ? "Q & R" : "Pitch"}
          </span>
        </div>
      </div>
      {elapsed && <p className="text-xs font-semibold text-red-500 mt-1">Temps écoulé</p>}
    </div>
  );
}

/* ── Drag-less ranking interface ── */
function PredictionPanel({ projects, currentPrediction, onSave, saving }) {
  const [ranked, setRanked] = useState(() => {
    if (currentPrediction?.length) {
      const ordered = currentPrediction
        .map(id => projects.find(p => p.id === id))
        .filter(Boolean);
      const rest = projects.filter(p => !currentPrediction.includes(p.id));
      return [...ordered, ...rest];
    }
    return [...projects];
  });

  const moveUp = (idx) => {
    if (idx === 0) return;
    setRanked(r => { const n = [...r]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n; });
  };

  const moveDown = (idx) => {
    if (idx === ranked.length - 1) return;
    setRanked(r => { const n = [...r]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n; });
  };

  const reset = () => setRanked([...projects]);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        Ordonnez les projets selon votre pronostic de classement final. Utilisez les flèches pour réordonner.
      </p>

      <div className="space-y-2">
        {ranked.map((p, i) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
          >
            <span className="text-lg w-6 text-center flex-shrink-0">
              {medals[i] || <span className="text-xs font-bold text-slate-400">#{i + 1}</span>}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-slate-800 truncate">{p.name}</p>
              {p.porteur && <p className="text-xs text-slate-400 truncate">{p.porteur}</p>}
            </div>
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="p-1 rounded-lg text-slate-400 hover:text-orange-500 disabled:opacity-20 transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === ranked.length - 1}
                className="p-1 rounded-lg text-slate-400 hover:text-orange-500 disabled:opacity-20 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(ranked.map(p => p.id))}
          disabled={saving}
          className="flex-1 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />
          }
          {currentPrediction ? "Mettre à jour" : "Enregistrer mon pronostic"}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-slate-400 hover:text-slate-700 hover:border-slate-400 transition-colors"
          title="Réinitialiser"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function VoteGuest() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [guestInfo, setGuestInfo]     = useState(null);
  const [status, setStatus]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [activeTab, setActiveTab]     = useState("live");
  const [savingPred, setSavingPred]   = useState(false);
  const [predSaved, setPredSaved]     = useState(false);
  const [guestResults, setGuestResults] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const raw = localStorage.getItem(`vote_guest_${sessionId}`);
    if (!raw) { navigate(`/vote/guest-join/${sessionId}`, { replace: true }); return; }
    try {
      setGuestInfo(JSON.parse(raw));
    } catch {
      localStorage.removeItem(`vote_guest_${sessionId}`);
      navigate(`/vote/guest-join/${sessionId}`, { replace: true });
    }
  }, [sessionId, navigate]);

  const poll = useCallback(async () => {
    if (!guestInfo?.token) return;
    try {
      const r = await api.get("/vote/guest/status", { headers: { "X-Guest-Token": guestInfo.token } });
      setStatus(r.data);
      setLoading(false);
    } catch (err) {
      if (err?.response?.status === 401) {
        localStorage.removeItem(`vote_guest_${sessionId}`);
        navigate(`/vote/guest-join/${sessionId}`, { replace: true });
      } else {
        setError("Problème de connexion...");
        setLoading(false);
      }
    }
  }, [guestInfo, sessionId, navigate]);

  useEffect(() => {
    if (!guestInfo) return;
    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, [guestInfo, poll]);

  useEffect(() => {
    if (status?.session_status === "closed" && guestInfo?.token && !guestResults) {
      api.get(`/vote/sessions/${sessionId}/guest-results`, { headers: { "X-Guest-Token": guestInfo.token } })
        .then(r => setGuestResults(r.data))
        .catch(() => {});
    }
  }, [status?.session_status, guestInfo, sessionId, guestResults]);

  const handleSavePrediction = async (ranking) => {
    if (!guestInfo?.token) return;
    setSavingPred(true);
    try {
      await api.post("/vote/guest/predict", { predicted_ranking: ranking }, { headers: { "X-Guest-Token": guestInfo.token } });
      setPredSaved(true);
      setStatus(s => ({ ...s, my_prediction: ranking }));
      setTimeout(() => setPredSaved(false), 2500);
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur lors de l'enregistrement.");
    }
    setSavingPred(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  /* ── Session terminée ── */
  if (status?.session_status === "closed") {
    const ranking = guestResults?.ranking || [];
    const myPred  = guestResults?.my_prediction;
    const won     = guestResults?.prediction_correct;
    const medals  = ["🥇", "🥈", "🥉"];

    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6 anim-fade-in-up">
            <Trophy className="w-14 h-14 text-orange-400 mx-auto mb-3" />
            <p className="text-2xl font-bold text-slate-900 mb-1">Session terminée</p>
            <p className="text-slate-500 text-sm">Bonjour {guestInfo?.prenom} ! Voici les résultats.</p>
          </div>

          {/* Classement final */}
          {ranking.length > 0 && (
            <div className="space-y-3 mb-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Classement final</p>
              {ranking.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-2xl p-4 border shadow-sm anim-fade-in-up ${
                    i === 0 ? "bg-orange-50 border-orange-200" : "bg-white border-slate-200"
                  }`}
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <span className="text-2xl">{medals[i] || `#${i + 1}`}</span>
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
          )}

          {/* Résultat pronostic */}
          {myPred && (
            <div className={`rounded-2xl border p-5 mb-5 anim-fade-in-up ${won ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`} style={{ animationDelay: "400ms" }}>
              <p className="font-semibold text-sm mb-3 text-slate-800">
                {won ? "🎉 Félicitations ! Votre pronostic est correct !" : "Votre pronostic"}
              </p>
              <div className="space-y-1">
                {myPred.slice(0, 3).map((id, i) => {
                  const proj = ranking.find(p => p.id === id) || { name: id };
                  const correct = ranking[i]?.id === id;
                  return (
                    <div key={id} className="flex items-center gap-2 text-sm">
                      <span>{medals[i] || `#${i + 1}`}</span>
                      <span className={correct ? "text-green-700 font-semibold" : "text-slate-600"}>{proj.name}</span>
                      {correct && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    </div>
                  );
                })}
              </div>
              {won && (
                <p className="mt-3 text-sm text-green-700 font-medium">
                  Votre classement correspond exactement au jury — vous gagnez des goodies ! 🎁
                </p>
              )}
            </div>
          )}

          <p className="text-center text-xs text-slate-400 mt-4">Orange Digital Center Sénégal</p>
        </div>
      </div>
    );
  }

  /* ── Session active ── */
  const proj     = status?.active_project;
  const projects = status?.projects || [];

  const TABS = [
    { id: "live",     label: "En direct" },
    { id: "projects", label: `Projets (${projects.length})` },
    { id: "predict",  label: "Mon pronostic" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-6">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5 anim-fade-in-up">
          <Avatar src={guestInfo?.avatar} className="w-12 h-12 rounded-xl flex-shrink-0 border border-slate-100" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 truncate">{guestInfo?.prenom} {guestInfo?.nom}</p>
            <p className="text-xs text-slate-400">Invité · {status?.session_name}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 mb-5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                activeTab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 text-xs mb-4">
            {error}
          </div>
        )}

        {/* Tab: En direct */}
        {activeTab === "live" && (
          <div className="anim-fade-in-up">
            {!proj ? (
              <div className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-slate-500 text-sm mb-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>En attente du prochain projet...</span>
                </div>
                <p className="text-xs text-slate-400">L&apos;administrateur lancera la présentation sous peu</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
                  <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1">Projet en cours</p>
                  <h2 className="text-xl font-bold text-slate-900 mb-1">{proj.name}</h2>
                  {proj.porteur && <p className="text-sm text-slate-500 mb-3">{proj.porteur}</p>}
                  {proj.description && (
                    <p className="text-sm text-slate-600 leading-relaxed mb-3">{proj.description}</p>
                  )}
                  {(proj.presentation_url || proj.presentation_pdf) && (
                    <a
                      href={proj.presentation_url || `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/vote/presentations/${proj.presentation_pdf}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 px-4 py-2.5 text-sm font-medium hover:bg-orange-100 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Voir la présentation
                    </a>
                  )}
                </div>

                {/* Timers (lecture seule, pas de vote) */}
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Chronomètre</p>
                  <div className="flex justify-center gap-6">
                    {proj.started_at && (
                      <CircleTimer
                        startedAt={proj.started_at}
                        stoppedAt={proj.pitch_stopped_at}
                        durationMinutes={status.pitch_duration_minutes}
                        size="sm"
                      />
                    )}
                    {proj.qa_started_at && (
                      <CircleTimer
                        startedAt={proj.qa_started_at}
                        stoppedAt={proj.qa_stopped_at}
                        durationMinutes={status.qa_duration_minutes}
                        label="Q&R"
                        size="sm"
                      />
                    )}
                  </div>
                  <p className="text-center text-xs text-slate-300 mt-2">Visible uniquement — vous ne votez pas</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Projets */}
        {activeTab === "projects" && (
          <div className="space-y-3 anim-fade-in-up">
            {projects.length === 0 ? (
              <p className="text-sm text-slate-400 italic text-center py-8">Aucun projet disponible</p>
            ) : projects.map((p, i) => (
              <div key={p.id} className={`rounded-2xl border shadow-sm p-4 ${p.id === proj?.id ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xs font-bold text-slate-400 mt-0.5 w-4">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-slate-800">{p.name}</p>
                      {p.id === proj?.id && (
                        <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 rounded-full px-2 py-0.5">En cours</span>
                      )}
                    </div>
                    {p.porteur && <p className="text-xs text-slate-500 mt-0.5">{p.porteur}</p>}
                    {p.description && <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{p.description}</p>}
                    {(p.presentation_url || p.presentation_pdf) && (
                      <a
                        href={p.presentation_url || `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/vote/presentations/${p.presentation_pdf}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline mt-2"
                      >
                        <ExternalLink className="w-3 h-3" /> Présentation
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab: Mon pronostic */}
        {activeTab === "predict" && (
          <div className="anim-fade-in-up">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <ListOrdered className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="font-semibold text-slate-800">Votre pronostic</p>
                  <p className="text-xs text-slate-400">Prédisez le classement final du jury</p>
                </div>
              </div>

              {projects.length < 2 ? (
                <p className="text-sm text-slate-400 italic">Attendez que les projets soient ajoutés</p>
              ) : (
                <>
                  {predSaved && (
                    <div className="flex items-center gap-2 text-green-600 text-sm rounded-xl bg-green-50 border border-green-200 px-4 py-3 mb-4">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      Pronostic enregistré !
                    </div>
                  )}
                  {status?.my_prediction && !predSaved && (
                    <div className="text-xs text-slate-400 mb-3 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      Pronostic déjà envoyé — vous pouvez le modifier jusqu&apos;à la clôture.
                    </div>
                  )}
                  <PredictionPanel
                    projects={projects}
                    currentPrediction={status?.my_prediction}
                    onSave={handleSavePrediction}
                    saving={savingPred}
                  />
                </>
              )}
            </div>

            <div className="mt-4 rounded-2xl bg-orange-50 border border-orange-100 p-4">
              <p className="text-xs text-orange-700 font-semibold mb-1">Comment gagner des goodies ?</p>
              <p className="text-xs text-orange-600">
                Si votre pronostic correspond exactement au top 3 du jury, vous remportez des goodies Orange Digital Center.
                Soumettez votre pronostic avant la fin de la session !
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-8 pb-4">Orange Digital Center Sénégal</p>
      </div>
    </div>
  );
}
