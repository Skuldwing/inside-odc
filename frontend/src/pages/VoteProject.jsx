import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Loader2, ExternalLink, FileText, Monitor } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

/* ── Helpers embed ── */
function getYoutubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
  return m ? m[1] : null;
}
function getVimeoId(url) {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}
function getGoogleSlidesEmbed(url) {
  if (url.includes("docs.google.com/presentation")) {
    return url.replace(/\/edit.*$/, "/embed?start=false&loop=false&delayms=3000");
  }
  return null;
}
function getCanvaEmbed(url) {
  if (url.includes("canva.com/design") && !url.includes("/embed")) {
    return null; // Canva embeds are not always available
  }
  return null;
}

function PresentationEmbed({ url, pdf }) {
  if (pdf) {
    const pdfUrl = `${API_BASE}/vote/presentations/${pdf}`;
    return (
      <iframe
        src={pdfUrl}
        className="w-full h-full rounded-xl border-0"
        title="Présentation PDF"
      />
    );
  }
  if (url) {
    const slidesEmbed = getGoogleSlidesEmbed(url);
    if (slidesEmbed) {
      return <iframe src={slidesEmbed} className="w-full h-full rounded-xl border-0" title="Présentation" allowFullScreen />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <FileText className="w-16 h-16 text-slate-400 opacity-50" />
        <p className="text-slate-400 text-sm">Présentation externe</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> Ouvrir la présentation
        </a>
      </div>
    );
  }
  return null;
}

function VideoEmbed({ url, file }) {
  if (file) {
    return (
      <video
        src={`${API_BASE}/vote/videos/${file}`}
        controls
        className="w-full h-full rounded-xl object-contain bg-black"
      />
    );
  }
  if (url) {
    const ytId = getYoutubeId(url);
    if (ytId) {
      return (
        <iframe
          src={`https://www.youtube.com/embed/${ytId}`}
          className="w-full h-full rounded-xl border-0"
          title="Vidéo YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    }
    const vmId = getVimeoId(url);
    if (vmId) {
      return (
        <iframe
          src={`https://player.vimeo.com/video/${vmId}`}
          className="w-full h-full rounded-xl border-0"
          title="Vidéo Vimeo"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> Ouvrir la vidéo
        </a>
      </div>
    );
  }
  return null;
}

function CircleTimer({ startedAt, stoppedAt, durationMinutes, label }) {
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

  const elapsed  = timeLeft <= 0;
  const urgent   = !elapsed && timeLeft <= 10;
  const warning  = !elapsed && timeLeft <= 30;
  const R = 28; const circ = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(1, timeLeft / (durationMinutes * 60)));
  const stroke = elapsed ? "#ef4444" : warning ? "#f59e0b" : label ? "#a855f7" : "#f97316";
  const mins = Math.floor(Math.abs(timeLeft) / 60);
  const secs = Math.abs(timeLeft) % 60;
  const fmt  = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${elapsed ? "bg-red-500/20 text-red-300" : warning ? "bg-amber-500/20 text-amber-300" : label ? "bg-purple-500/20 text-purple-300" : "bg-orange-500/20 text-orange-300"} ${urgent ? "animate-pulse" : ""}`}>
      <svg viewBox="0 0 64 64" className="w-10 h-10 -rotate-90 flex-shrink-0">
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={stroke} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label || "Pitch"}</p>
        <p className="text-lg font-bold tabular-nums leading-none">{elapsed ? `+${fmt}` : fmt}</p>
      </div>
    </div>
  );
}

export default function VoteProject() {
  const { sessionId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("presentation");
  const [prevProjId, setPrevProjId] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/vote/project/${sessionId}`);
      if (!r.ok) throw new Error();
      const json = await r.json();
      setData(json);
      if (loading) setLoading(false);
    } catch {
      if (loading) setLoading(false);
    }
  }, [sessionId, loading]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, [fetchData]);

  /* Auto-switch tab when new project becomes active */
  useEffect(() => {
    if (!data?.active_project) return;
    const proj = data.active_project;
    if (proj.id !== prevProjId) {
      setPrevProjId(proj.id);
      const hasPresentation = proj.presentation_url || proj.presentation_pdf;
      const hasVideo = proj.video_url || proj.video_file;
      if (hasPresentation) setTab("presentation");
      else if (hasVideo) setTab("video");
      else setTab("info");
    }
  }, [data?.active_project?.id, prevProjId, data?.active_project]);

  const proj = data?.active_project;
  const hasPresentation = proj && (proj.presentation_url || proj.presentation_pdf);
  const hasVideo = proj && (proj.video_url || proj.video_file);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Barre supérieure */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-orange-400" />
          <span className="font-semibold text-slate-200 text-sm">{data?.session_name || "Session de vote"}</span>
          {data?.session_status === "active" && (
            <span className="text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5 uppercase tracking-wide">En direct</span>
          )}
          {data?.session_status === "closed" && (
            <span className="text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded-full px-2 py-0.5 uppercase tracking-wide">Terminée</span>
          )}
        </div>
        {proj && (
          <div className="flex items-center gap-2">
            {proj.started_at && (
              <CircleTimer startedAt={proj.started_at} stoppedAt={proj.pitch_stopped_at} durationMinutes={data?.pitch_duration_minutes} />
            )}
            {proj.qa_started_at && (
              <CircleTimer startedAt={proj.qa_started_at} stoppedAt={proj.qa_stopped_at} durationMinutes={data?.qa_duration_minutes} label="Q&R" />
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
        </div>
      ) : !proj ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-500">
          <Monitor className="w-20 h-20 opacity-20" />
          <p className="text-xl font-semibold">En attente du prochain projet...</p>
          <p className="text-sm">Le contenu apparaîtra dès qu'un projet sera activé par l'administrateur</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Info projet + tabs */}
          <div className="flex items-center gap-4 px-6 py-3 bg-slate-900/60 border-b border-slate-800 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">{proj.name}</h1>
              {proj.porteur && <p className="text-sm text-slate-400 mt-0.5">{proj.porteur}</p>}
            </div>
            {/* Tabs */}
            <div className="flex gap-1 bg-slate-800 rounded-xl p-1 flex-shrink-0">
              {hasPresentation && (
                <button
                  onClick={() => setTab("presentation")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === "presentation" ? "bg-orange-500 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  <FileText className="w-3.5 h-3.5" /> Présentation
                </button>
              )}
              {hasVideo && (
                <button
                  onClick={() => setTab("video")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === "video" ? "bg-orange-500 text-white" : "text-slate-400 hover:text-white"}`}
                >
                  🎬 Vidéo
                </button>
              )}
              <button
                onClick={() => setTab("info")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${tab === "info" ? "bg-orange-500 text-white" : "text-slate-400 hover:text-white"}`}
              >
                💡 Infos
              </button>
            </div>
          </div>

          {/* Contenu principal */}
          <div className="flex-1 min-h-0 p-4">
            {tab === "presentation" && hasPresentation && (
              <div className="h-full">
                <PresentationEmbed url={proj.presentation_url} pdf={proj.presentation_pdf} />
              </div>
            )}
            {tab === "video" && hasVideo && (
              <div className="h-full">
                <VideoEmbed url={proj.video_url} file={proj.video_file} />
              </div>
            )}
            {tab === "info" && (
              <div className="max-w-2xl mx-auto mt-8 space-y-6">
                <div className="rounded-2xl bg-slate-800 p-6">
                  <h2 className="text-3xl font-bold text-white mb-2">{proj.name}</h2>
                  {proj.porteur && <p className="text-orange-400 font-semibold text-lg mb-4">{proj.porteur}</p>}
                  {proj.description && <p className="text-slate-300 text-base leading-relaxed">{proj.description}</p>}
                </div>
                <div className="flex gap-3 flex-wrap">
                  {(proj.presentation_url || proj.presentation_pdf) && (
                    <a
                      href={proj.presentation_url || `${API_BASE}/vote/presentations/${proj.presentation_pdf}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2.5 text-sm font-medium text-white transition-colors"
                    >
                      <FileText className="w-4 h-4" /> Ouvrir présentation
                    </a>
                  )}
                  {(proj.video_url || proj.video_file) && (
                    <a
                      href={proj.video_url || `${API_BASE}/vote/videos/${proj.video_file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2.5 text-sm font-medium text-white transition-colors"
                    >
                      🎬 Ouvrir vidéo
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
