import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { Loader2, ChevronUp, ChevronDown, Monitor, FileText, ExternalLink } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/* ─── Helpers embed ─── */
function getYoutubeId(url) {
  const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/);
  return m ? m[1] : null;
}
function getVimeoId(url) {
  const m = url?.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}
function getGoogleSlidesEmbed(url) {
  if (url?.includes("docs.google.com/presentation"))
    return url.replace(/\/edit.*$/, "/embed?start=false&loop=false&delayms=0");
  return null;
}
function getFileExt(filename) {
  return filename?.split(".").pop()?.toLowerCase() || "";
}

/* ─── Lecteur PDF page par page ─── */
function PdfViewer({ url, onReset }) {
  const canvasRef   = useRef(null);
  const containerRef = useRef(null);
  const renderRef   = useRef(null);
  const [pdfDoc, setPdfDoc]       = useState(null);
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);

  /* Reload PDF dès que l'URL change (nouveau projet) */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(1);
    setPdfDoc(null);
    pdfjsLib.getDocument({ url, withCredentials: false }).promise.then((doc) => {
      if (cancelled) return;
      setPdfDoc(doc);
      setTotal(doc.numPages);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [url]);

  /* Rendu de la page courante */
  const renderPage = useCallback(async (doc, pageNum) => {
    if (!doc || !canvasRef.current) return;
    if (renderRef.current) { try { renderRef.current.cancel(); } catch {} }
    const pg        = await doc.getPage(pageNum);
    const canvas    = canvasRef.current;
    const cont      = containerRef.current;
    const cw        = cont?.clientWidth  || window.innerWidth;
    const ch        = cont?.clientHeight || window.innerHeight;
    const vp1       = pg.getViewport({ scale: 1 });
    const scale     = Math.min(cw / vp1.width, ch / vp1.height) * 0.96;
    const viewport  = pg.getViewport({ scale });
    canvas.width    = viewport.width;
    canvas.height   = viewport.height;
    const task = pg.render({ canvasContext: canvas.getContext("2d"), viewport });
    renderRef.current = task;
    try { await task.promise; } catch (e) { if (e.name !== "RenderingCancelledException") throw e; }
  }, []);

  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, page); }, [pdfDoc, page, renderPage]);

  /* Reset à la slide 1 quand le projet change (signal du parent) */
  useEffect(() => { setPage(1); }, [onReset]);

  /* Navigation clavier */
  useEffect(() => {
    const fn = (e) => {
      if (["ArrowDown","ArrowRight"," ","PageDown"].includes(e.key)) {
        e.preventDefault(); setPage(p => Math.min(p + 1, total));
      } else if (["ArrowUp","ArrowLeft","PageUp"].includes(e.key)) {
        e.preventDefault(); setPage(p => Math.max(p - 1, 1));
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [total]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-black">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
        </div>
      )}
      <canvas ref={canvasRef} className="max-w-full max-h-full shadow-2xl" />

      {/* Contrôles navigation */}
      {total > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/70 backdrop-blur-sm rounded-2xl px-5 py-3 select-none">
          <button
            onClick={() => setPage(p => Math.max(p - 1, 1))}
            disabled={page <= 1}
            className="text-white disabled:opacity-30 hover:text-orange-400 transition-colors"
            title="Slide précédente (↑)"
          >
            <ChevronUp className="w-7 h-7" />
          </button>
          <span className="text-white text-sm font-mono tabular-nums min-w-[60px] text-center">
            {page} / {total}
          </span>
          <button
            onClick={() => setPage(p => Math.min(p + 1, total))}
            disabled={page >= total}
            className="text-white disabled:opacity-30 hover:text-orange-400 transition-colors"
            title="Slide suivante (↓)"
          >
            <ChevronDown className="w-7 h-7" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Présentation PowerPoint via Office Online ─── */
function PptxViewer({ filename }) {
  const fileUrl  = `${API_BASE}/vote/presentations/${filename}`;
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  return (
    <iframe
      src={embedUrl}
      className="w-full h-full border-0"
      title="Présentation PowerPoint"
      allowFullScreen
    />
  );
}

/* ─── Embed générique (Google Slides, autre URL) ─── */
function UrlViewer({ url }) {
  const slidesEmbed = getGoogleSlidesEmbed(url);
  if (slidesEmbed) {
    return (
      <iframe
        src={slidesEmbed}
        className="w-full h-full border-0"
        title="Présentation"
        allowFullScreen
      />
    );
  }
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
      <FileText className="w-16 h-16 text-slate-600" />
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

/* ─── Lecteur vidéo ─── */
function VideoViewer({ url, file, autoplay }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (autoplay && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [autoplay]);

  if (file) {
    return (
      <video
        ref={videoRef}
        src={`${API_BASE}/vote/videos/${file}`}
        controls
        autoPlay={autoplay}
        className="w-full h-full object-contain bg-black"
      />
    );
  }
  const ytId = getYoutubeId(url);
  if (ytId) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${ytId}?autoplay=${autoplay ? 1 : 0}&rel=0`}
        className="w-full h-full border-0"
        title="Vidéo"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  const vmId = getVimeoId(url);
  if (vmId) {
    return (
      <iframe
        src={`https://player.vimeo.com/video/${vmId}?autoplay=${autoplay ? 1 : 0}`}
        className="w-full h-full border-0"
        title="Vidéo"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center">
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

/* ─── Timer compact ─── */
function MiniTimer({ startedAt, stoppedAt, durationMinutes, label }) {
  const [timeLeft, setTimeLeft] = useState(null);
  useEffect(() => {
    if (!startedAt || !durationMinutes) return;
    const endMs = new Date(startedAt).getTime() + durationMinutes * 60 * 1000;
    if (stoppedAt) { setTimeLeft(Math.round((endMs - new Date(stoppedAt).getTime()) / 1000)); return; }
    const calc = () => Math.round((endMs - Date.now()) / 1000);
    setTimeLeft(calc());
    const iv = setInterval(() => setTimeLeft(calc()), 1000);
    return () => clearInterval(iv);
  }, [startedAt, stoppedAt, durationMinutes]);
  if (timeLeft === null) return null;
  const elapsed  = timeLeft <= 0;
  const urgent   = !elapsed && timeLeft <= 10;
  const warning  = !elapsed && timeLeft <= 30;
  const color    = elapsed ? "text-red-400" : warning ? "text-amber-400" : label ? "text-purple-400" : "text-orange-400";
  const bgColor  = elapsed ? "bg-red-500/20 border-red-500/30" : warning ? "bg-amber-500/20 border-amber-500/30" : label ? "bg-purple-500/20 border-purple-500/30" : "bg-orange-500/20 border-orange-500/30";
  const mins = Math.floor(Math.abs(timeLeft) / 60);
  const secs = Math.abs(timeLeft) % 60;
  return (
    <div className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 ${bgColor} ${urgent ? "animate-pulse" : ""}`}>
      <span className="text-xs text-slate-400 uppercase tracking-wide">{label || "Pitch"}</span>
      <span className={`font-bold tabular-nums text-sm ${color}`}>
        {elapsed ? "+" : ""}{String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}
      </span>
    </div>
  );
}

/* ─── Page principale ─── */
export default function VoteProject() {
  const { sessionId } = useParams();
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [projReset, setProjReset] = useState(0); // incrémenté à chaque changement de projet → reset page PDF
  const prevProjIdRef           = useRef(null);
  const prevVideoRef            = useRef(false);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/vote/project/${sessionId}`);
      if (!r.ok) return;
      const json = await r.json();
      setData(json);
      if (loading) setLoading(false);

      /* Détecter changement de projet → reset slides */
      const newId = json.active_project?.id;
      if (newId && newId !== prevProjIdRef.current) {
        prevProjIdRef.current = newId;
        setProjReset(n => n + 1);
      }
    } catch {
      if (loading) setLoading(false);
    }
  }, [sessionId, loading]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 1000); // polling 1s pour réactivité vidéo
    return () => clearInterval(iv);
  }, [fetchData]);

  const proj            = data?.active_project;
  const videoActive     = data?.projector_video_active ?? false;
  const hasPresentation = proj && (proj.presentation_url || proj.presentation_pdf);
  const hasVideo        = proj && (proj.video_url || proj.video_file);
  const fileExt         = getFileExt(proj?.presentation_pdf);

  /* Détecter le premier passage en mode vidéo pour autoplay */
  const isNewVideoTrigger = videoActive && !prevVideoRef.current;
  prevVideoRef.current = videoActive;

  return (
    <div
      className="fixed inset-0 bg-black text-white flex flex-col overflow-hidden"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* ── Barre supérieure ── */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-slate-900/90 backdrop-blur-sm border-b border-slate-800 flex-shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <Monitor className="w-4 h-4 text-orange-400 flex-shrink-0" />
          <span className="text-slate-400 text-xs truncate">{data?.session_name || "…"}</span>
          {proj && (
            <>
              <span className="text-slate-700">·</span>
              <span className="font-semibold text-white text-sm truncate">{proj.name}</span>
              {proj.porteur && <span className="text-slate-400 text-xs truncate hidden sm:block">— {proj.porteur}</span>}
            </>
          )}
        </div>

        {/* Timers */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {proj?.started_at && (
            <MiniTimer
              startedAt={proj.started_at}
              stoppedAt={proj.pitch_stopped_at}
              durationMinutes={data?.pitch_duration_minutes}
            />
          )}
          {proj?.qa_started_at && (
            <MiniTimer
              startedAt={proj.qa_started_at}
              stoppedAt={proj.qa_stopped_at}
              durationMinutes={data?.qa_duration_minutes}
              label="Q&R"
            />
          )}
          {videoActive && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 uppercase tracking-wide animate-pulse">
              ● Vidéo
            </span>
          )}
        </div>
      </div>

      {/* ── Contenu ── */}
      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-orange-400" />
          </div>
        ) : !proj ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-slate-600">
            <Monitor className="w-24 h-24 opacity-10" />
            <div className="text-center">
              <p className="text-2xl font-semibold text-slate-500">En attente du prochain projet</p>
              <p className="text-sm text-slate-600 mt-2">Le contenu apparaîtra automatiquement</p>
            </div>
          </div>
        ) : videoActive && hasVideo ? (
          /* ── Mode vidéo (déclenché par l'admin) ── */
          <VideoViewer
            url={proj.video_url}
            file={proj.video_file}
            autoplay={isNewVideoTrigger}
          />
        ) : hasPresentation ? (
          /* ── Mode présentation ── */
          fileExt === "pdf" ? (
            <PdfViewer
              url={`${API_BASE}/vote/presentations/${proj.presentation_pdf}`}
              onReset={projReset}
            />
          ) : fileExt === "pptx" || fileExt === "ppt" ? (
            <PptxViewer filename={proj.presentation_pdf} />
          ) : (
            <UrlViewer url={proj.presentation_url} />
          )
        ) : hasVideo ? (
          /* Pas de présentation mais une vidéo : l'afficher directement */
          <VideoViewer url={proj.video_url} file={proj.video_file} autoplay={false} />
        ) : (
          /* Ni présentation ni vidéo */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-700">
            <p className="text-xl font-bold text-slate-400">{proj.name}</p>
            {proj.porteur && <p className="text-slate-500">{proj.porteur}</p>}
            {proj.description && <p className="text-slate-600 text-sm max-w-lg text-center">{proj.description}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
