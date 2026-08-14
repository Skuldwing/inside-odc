import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Play, Plus, Trash2, Edit2, Check, X, Loader2, QrCode, Copy, ExternalLink,
  Download, Maximize2, Share2, Users, Upload, FileText,
} from "lucide-react";
import api from "../api";

const AVATARS = ["🧑","👩","👨","😎","🤓","🦸","🧙","🎓","🏆","⭐","🚀","💡","🎯","🔥","💪","🌟","🦁","🐯","🦊","🐺"];

const STATUS_LABEL = { draft: "Brouillon", active: "En cours", closed: "Terminé" };
const STATUS_CLS   = { draft: "bg-slate-100 text-slate-600", active: "bg-orange-100 text-orange-700", closed: "bg-green-100 text-green-700" };

function GuestQrSection({ session, qrDataUrl, guestJoinUrl, onProject }) {
  const [copiedGuest, setCopiedGuest] = useState(false);

  const copyLink = () => {
    navigator.clipboard.writeText(guestJoinUrl).catch(() => {});
    setCopiedGuest(true);
    setTimeout(() => setCopiedGuest(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-semibold text-slate-800">QR Code invités</h2>
          <p className="text-xs text-slate-400 mt-0.5">Pour le public — pas de vote, pronostic uniquement</p>
        </div>
        <a href={guestJoinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">
          <ExternalLink className="w-3 h-3" /> Ouvrir
        </a>
      </div>

      <div className="flex flex-col items-center gap-4">
        {qrDataUrl ? (
          <button
            onClick={onProject}
            title="Projeter en plein écran"
            className="group relative bg-white rounded-2xl border-2 border-purple-200 p-4 shadow-sm hover:border-purple-400 transition-colors"
          >
            <img src={qrDataUrl} alt="QR Code invités" className="w-56 h-56" />
            <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
              <Maximize2 className="w-6 h-6 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </button>
        ) : (
          <div className="w-56 h-56 rounded-2xl border-2 border-slate-200 flex items-center justify-center">
            <QrCode className="w-12 h-12 text-slate-200" />
          </div>
        )}

        <div className="text-center">
          <p className="font-semibold text-slate-800">{session.name}</p>
          <p className="text-xs text-purple-500 mt-0.5">Espace invités</p>
        </div>

        <div className="w-full flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <span className="text-xs text-slate-500 flex-1 truncate font-mono">{guestJoinUrl}</span>
          <button onClick={copyLink} title="Copier le lien" className="flex-shrink-0 text-slate-400 hover:text-orange-500 transition-colors">
            {copiedGuest ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        {navigator.share && (
          <button
            onClick={() => navigator.share({ title: `Invités — ${session.name}`, url: guestJoinUrl }).catch(() => {})}
            className="w-full flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 py-3 text-xs font-medium text-slate-600 hover:border-purple-300 hover:text-purple-500 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            Partager le lien invités
          </button>
        )}
      </div>
    </div>
  );
}

export default function VoteConfig() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  /* editable session info */
  const [editInfo, setEditInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ name: "", event_date: "", pitch_duration_minutes: 5, qa_duration_minutes: 5 });
  const [savingInfo, setSavingInfo] = useState(false);

  /* project form */
  const [showProjForm, setShowProjForm] = useState(false);
  const [projForm, setProjForm] = useState({ name: "", porteur: "", description: "", presentation_url: "", presentation_pdf: "" });
  const [presType, setPresType] = useState("url");
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [savingProj, setSavingProj] = useState(false);
  const [editingProj, setEditingProj] = useState(null);
  const [qrGuestDataUrl, setQrGuestDataUrl] = useState("");

  /* criteria form */
  const [showCritForm, setShowCritForm] = useState(false);
  const [critForm, setCritForm] = useState({ name: "", scale: 10, weight: 1, description: "" });
  const [savingCrit, setSavingCrit] = useState(false);
  const [editingCrit, setEditingCrit] = useState(null);

  const [activating, setActivating] = useState(false);
  const [projecting, setProjecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrTab, setQrTab] = useState("jury");

  const fetch = async () => {
    try {
      const r = await api.get(`/vote/sessions/${id}`);
      setSession(r.data);
      setInfoForm({ name: r.data.name, event_date: r.data.event_date ? String(r.data.event_date).slice(0, 10) : "", pitch_duration_minutes: r.data.pitch_duration_minutes ?? 5, qa_duration_minutes: r.data.qa_duration_minutes ?? 5 });
      if (r.data.status !== "draft") generateQr(r.data.id);
    } catch {
      setError("Session introuvable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [id]);

  const generateQr = async (sid) => {
    try {
      const QRCode = await import("qrcode");
      const [juryUrl, dataUrl] = await Promise.all([
        QRCode.default.toDataURL(`${window.location.origin}/vote/join/${sid}`, {
          width: 512, margin: 2, color: { dark: "#1e293b", light: "#ffffff" },
        }),
        QRCode.default.toDataURL(`${window.location.origin}/vote/guest-join/${sid}`, {
          width: 512, margin: 2, color: { dark: "#7c3aed", light: "#ffffff" },
        }),
      ]);
      setQrDataUrl(juryUrl);
      setQrGuestDataUrl(dataUrl);
    } catch {}
  };

  /* Escape ferme le mode projection */
  useEffect(() => {
    if (!projecting) return;
    const handleKey = (e) => { if (e.key === "Escape") setProjecting(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [projecting]);

  /* ---- Session info ---- */
  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      const r = await api.put(`/vote/sessions/${id}`, infoForm);
      setSession(s => ({ ...s, ...r.data }));
      setEditInfo(false);
    } catch { setError("Erreur sauvegarde."); }
    setSavingInfo(false);
  };

  /* ---- Activate ---- */
  const activate = async () => {
    if (session.projects?.length === 0) { setError("Ajoutez au moins un projet avant d'activer."); return; }
    if (session.criteria?.length === 0) { setError("Ajoutez au moins un critère avant d'activer."); return; }
    setActivating(true);
    try {
      const r = await api.put(`/vote/sessions/${id}/activate`);
      setSession(s => ({ ...s, ...r.data }));
      generateQr(r.data.id);
    } catch { setError("Erreur activation."); }
    setActivating(false);
  };

  /* ---- Projects ---- */
  const saveProject = async (e) => {
    e.preventDefault();
    if (!projForm.name.trim()) return;
    setSavingProj(true);
    try {
      if (editingProj) {
        const r = await api.put(`/vote/sessions/${id}/projects/${editingProj}`, projForm);
        setSession(s => ({ ...s, projects: s.projects.map(p => p.id === editingProj ? r.data : p) }));
        setEditingProj(null);
      } else {
        const r = await api.post(`/vote/sessions/${id}/projects`, { ...projForm, order_num: session.projects?.length || 0 });
        setSession(s => ({ ...s, projects: [...(s.projects || []), r.data] }));
      }
      setProjForm({ name: "", porteur: "", description: "" });
      setShowProjForm(false);
    } catch { setError("Erreur sauvegarde projet."); }
    setSavingProj(false);
  };

  const deleteProject = async (pid) => {
    if (!confirm("Supprimer ce projet ?")) return;
    try {
      await api.delete(`/vote/sessions/${id}/projects/${pid}`);
      setSession(s => ({ ...s, projects: s.projects.filter(p => p.id !== pid) }));
    } catch { setError("Erreur suppression."); }
  };

  const startEditProject = (p) => {
    setEditingProj(p.id);
    const type = p.presentation_pdf ? "pdf" : "url";
    setPresType(type);
    setProjForm({ name: p.name, porteur: p.porteur || "", description: p.description || "", presentation_url: p.presentation_url || "", presentation_pdf: p.presentation_pdf || "" });
    setShowProjForm(true);
  };

  const handlePdfSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPdf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/vote/upload-presentation", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setProjForm(p => ({ ...p, presentation_pdf: r.data.filename, presentation_url: "" }));
    } catch {
      alert("Erreur lors de l'upload du PDF.");
    } finally {
      setUploadingPdf(false);
      e.target.value = "";
    }
  };

  /* ---- Criteria ---- */
  const saveCriterion = async (e) => {
    e.preventDefault();
    if (!critForm.name.trim()) return;
    setSavingCrit(true);
    try {
      if (editingCrit) {
        const r = await api.put(`/vote/sessions/${id}/criteria/${editingCrit}`, { ...critForm, order_num: 0 });
        setSession(s => ({ ...s, criteria: s.criteria.map(c => c.id === editingCrit ? r.data : c) }));
        setEditingCrit(null);
      } else {
        const r = await api.post(`/vote/sessions/${id}/criteria`, { ...critForm, order_num: session.criteria?.length || 0 });
        setSession(s => ({ ...s, criteria: [...(s.criteria || []), r.data] }));
      }
      setCritForm({ name: "", scale: 10, weight: 1, description: "" });
      setShowCritForm(false);
    } catch { setError("Erreur sauvegarde critère."); }
    setSavingCrit(false);
  };

  const deleteCriterion = async (cid) => {
    if (!confirm("Supprimer ce critère ?")) return;
    try {
      await api.delete(`/vote/sessions/${id}/criteria/${cid}`);
      setSession(s => ({ ...s, criteria: s.criteria.filter(c => c.id !== cid) }));
    } catch { setError("Erreur suppression."); }
  };

  const startEditCrit = (c) => {
    setEditingCrit(c.id);
    setCritForm({ name: c.name, scale: c.scale, weight: c.weight, description: c.description || "" });
    setShowCritForm(true);
  };

  const copyJoinLink = () => {
    navigator.clipboard.writeText(joinUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const canvas = document.createElement("canvas");
    const qrSize = 512;
    const padding = 32;
    const dateText = session.event_date
      ? new Date(session.event_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
      : null;
    const headerH = dateText ? 76 : 50;
    const footerH = 52;
    canvas.width = qrSize + padding * 2;
    canvas.height = headerH + qrSize + footerH;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = "center";
    ctx.fillStyle = "#f97316";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText(session.name, canvas.width / 2, 34);
    if (dateText) {
      ctx.fillStyle = "#64748b";
      ctx.font = "15px system-ui, sans-serif";
      ctx.fillText(dateText, canvas.width / 2, 58);
    }

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, headerH, qrSize, qrSize);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "12px monospace, monospace";
      ctx.fillText(joinUrl, canvas.width / 2, headerH + qrSize + 30);

      const a = document.createElement("a");
      a.download = `jury-qr-${session.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = qrDataUrl;
  };

  const shareLink = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: `Rejoindre le jury — ${session.name}`,
        text: `Scannez ou cliquez pour rejoindre le jury de ${session.name}`,
        url: joinUrl,
      });
    } catch {}
  };

  const joinUrl      = `${window.location.origin}/vote/join/${id}`;
  const guestJoinUrl = `${window.location.origin}/vote/guest-join/${id}`;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>;
  if (error && !session) return <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">{error}</div>;
  const badge = STATUS_CLS[session.status] || STATUS_CLS.draft;

  return (
    <>
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/vote")} className="rounded-xl p-2 hover:bg-slate-100 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{session.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>{STATUS_LABEL[session.status]}</span>
          </div>
          {session.event_date && (
            <p className="text-sm text-slate-500">{new Date(session.event_date).toLocaleDateString("fr-FR")}</p>
          )}
        </div>
        {session.status === "active" && (
          <button
            onClick={() => navigate(`/vote/${id}/manage`)}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            <Play className="w-4 h-4" /> Gérer en direct
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}

      {/* ── Section 1: Infos ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Informations</h2>
          {session.status === "draft" && (
            <button onClick={() => setEditInfo(v => !v)} className="text-xs text-orange-500 hover:underline">
              {editInfo ? "Annuler" : "Modifier"}
            </button>
          )}
        </div>
        {editInfo ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600">Nom *</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none"
                value={infoForm.name}
                onChange={e => setInfoForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Date</label>
              <input type="date" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" value={infoForm.event_date} onChange={e => setInfoForm(p => ({ ...p, event_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Durée du pitch</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none bg-white"
                value={infoForm.pitch_duration_minutes}
                onChange={e => setInfoForm(p => ({ ...p, pitch_duration_minutes: Number(e.target.value) }))}
              >
                {[1, 2, 3, 5, 7, 10, 15, 20].map(n => (
                  <option key={n} value={n}>{n} minute{n > 1 ? "s" : ""}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Timer affiché au jury pendant le pitch</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Durée des questions / réponses</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none bg-white"
                value={infoForm.qa_duration_minutes}
                onChange={e => setInfoForm(p => ({ ...p, qa_duration_minutes: Number(e.target.value) }))}
              >
                {[1, 2, 3, 5, 7, 10, 15, 20].map(n => (
                  <option key={n} value={n}>{n} minute{n > 1 ? "s" : ""}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Timer Q&amp;R lancé manuellement par l'admin</p>
            </div>
            <button onClick={saveInfo} disabled={savingInfo} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              {savingInfo ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        ) : (
          <div className="text-sm text-slate-700 space-y-1">
            <p><span className="text-slate-500">Nom :</span> {session.name}</p>
            <p><span className="text-slate-500">Date :</span> {session.event_date ? new Date(session.event_date).toLocaleDateString("fr-FR") : "—"}</p>
            <p><span className="text-slate-500">Durée pitch :</span> {session.pitch_duration_minutes ?? 5} min</p>
            <p><span className="text-slate-500">Durée Q&amp;R :</span> {session.qa_duration_minutes ?? 5} min</p>
            <p><span className="text-slate-500">Statut :</span> {STATUS_LABEL[session.status]}</p>
          </div>
        )}
      </section>

      {/* ── Section 2: Projets ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">
            Projets <span className="text-slate-400 font-normal text-sm">({session.projects?.length || 0})</span>
          </h2>
          {session.status === "draft" && (
            <button
              onClick={() => { setEditingProj(null); setProjForm({ name: "", porteur: "", description: "" }); setShowProjForm(v => !v); }}
              className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          )}
        </div>

        {session.projects?.length === 0 && !showProjForm && (
          <p className="text-sm text-slate-400 italic">Aucun projet ajouté</p>
        )}

        <div className="space-y-2 mb-3">
          {session.projects?.map((p, i) => (
            <div key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-xs font-bold text-slate-400 mt-0.5 w-4">#{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-800">{p.name}</p>
                {p.porteur && <p className="text-xs text-slate-500">{p.porteur}</p>}
                {p.description && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{p.description}</p>}
                {(p.presentation_url || p.presentation_pdf) && (
                  <a
                    href={p.presentation_url || `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/vote/presentations/${p.presentation_pdf}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline mt-1"
                  >
                    {p.presentation_pdf ? <FileText className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                    {p.presentation_pdf ? "PDF" : "Présentation"}
                  </a>
                )}
              </div>
              {session.status === "draft" && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEditProject(p)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteProject(p.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        {showProjForm && session.status === "draft" && (
          <form onSubmit={saveProject} className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-orange-700">{editingProj ? "Modifier le projet" : "Nouveau projet"}</p>
            <div>
              <label className="text-xs font-medium text-slate-600">Nom du projet *</label>
              <input required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" placeholder="AgriTech AI" value={projForm.name} onChange={e => setProjForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Porteur / Équipe</label>
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" placeholder="Équipe Alpha" value={projForm.porteur} onChange={e => setProjForm(p => ({ ...p, porteur: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <textarea rows={2} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none resize-none" placeholder="Courte description du projet..." value={projForm.description} onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Présentation</label>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => { setPresType("url"); setProjForm(p => ({ ...p, presentation_pdf: "" })); }}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${presType === "url" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <ExternalLink className="w-3 h-3" /> Lien URL
                </button>
                <button
                  type="button"
                  onClick={() => { setPresType("pdf"); setProjForm(p => ({ ...p, presentation_url: "" })); }}
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${presType === "pdf" ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <FileText className="w-3 h-3" /> Fichier PDF
                </button>
              </div>
              {presType === "url" ? (
                <input
                  type="url"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none"
                  placeholder="https://docs.google.com/..."
                  value={projForm.presentation_url}
                  onChange={e => setProjForm(p => ({ ...p, presentation_url: e.target.value }))}
                />
              ) : projForm.presentation_pdf ? (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                  <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-xs text-green-700 flex-1 truncate font-mono">{projForm.presentation_pdf}</span>
                  <button type="button" onClick={() => setProjForm(p => ({ ...p, presentation_pdf: "" }))} className="text-slate-400 hover:text-red-500 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className={`mt-2 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors ${uploadingPdf ? "opacity-50 pointer-events-none" : ""}`}>
                  <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={uploadingPdf} onChange={handlePdfSelect} />
                  {uploadingPdf
                    ? <><Loader2 className="w-4 h-4 animate-spin text-orange-400" /><span className="text-xs text-slate-500">Envoi en cours...</span></>
                    : <><Upload className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-500">Cliquer pour uploader un PDF (max 20 Mo)</span></>
                  }
                </label>
              )}
              <p className="text-xs text-slate-400 mt-0.5">Visible par les invités pendant la présentation</p>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingProj} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {savingProj ? "..." : editingProj ? "Modifier" : "Ajouter"}
              </button>
              <button type="button" onClick={() => { setShowProjForm(false); setEditingProj(null); }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100">Annuler</button>
            </div>
          </form>
        )}
      </section>

      {/* ── Section 3: Critères ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">
            Critères de notation <span className="text-slate-400 font-normal text-sm">({session.criteria?.length || 0})</span>
          </h2>
          {session.status === "draft" && (
            <button
              onClick={() => { setEditingCrit(null); setCritForm({ name: "", scale: 10, weight: 1, description: "" }); setShowCritForm(v => !v); }}
              className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          )}
        </div>

        {session.criteria?.length === 0 && !showCritForm && (
          <p className="text-sm text-slate-400 italic">Aucun critère ajouté</p>
        )}

        <div className="space-y-2 mb-3">
          {session.criteria?.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500">Note sur {c.scale} · Poids {c.weight}</p>
                {c.description && <p className="text-xs text-slate-400 mt-0.5 truncate italic">{c.description}</p>}
              </div>
              {session.status === "draft" && (
                <div className="flex gap-1">
                  <button onClick={() => startEditCrit(c)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteCriterion(c.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>

        {showCritForm && session.status === "draft" && (
          <form onSubmit={saveCriterion} className="rounded-xl border border-orange-200 bg-orange-50/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-orange-700">{editingCrit ? "Modifier le critère" : "Nouveau critère"}</p>
            <div>
              <label className="text-xs font-medium text-slate-600">Intitulé *</label>
              <input required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" placeholder="Innovation" value={critForm.name} onChange={e => setCritForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description (ce que le jury doit évaluer)</label>
              <textarea
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none resize-none min-h-[64px]"
                placeholder="Ex : Originalité de la solution, potentiel d'impact, faisabilité technique…"
                value={critForm.description}
                onChange={e => setCritForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Échelle de note</label>
                <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" value={critForm.scale} onChange={e => setCritForm(p => ({ ...p, scale: Number(e.target.value) }))}>
                  <option value={5}>Sur 5</option>
                  <option value={10}>Sur 10</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Poids (coefficient)</label>
                <input type="number" min="0.1" max="10" step="0.1" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" value={critForm.weight} onChange={e => setCritForm(p => ({ ...p, weight: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingCrit} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {savingCrit ? "..." : editingCrit ? "Modifier" : "Ajouter"}
              </button>
              <button type="button" onClick={() => { setShowCritForm(false); setEditingCrit(null); }} className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-600 hover:bg-slate-100">Annuler</button>
            </div>
          </form>
        )}
      </section>

      {/* ── Section 4: Activation & QR ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {session.status === "draft" ? (
          <div>
            <h2 className="font-semibold text-slate-800 mb-2">Activer la session</h2>
            <p className="text-sm text-slate-500 mb-4">
              Une fois activée, les jurés pourront rejoindre via le QR code. Assurez-vous d&apos;avoir ajouté vos projets et critères.
            </p>
            <button
              onClick={activate}
              disabled={activating}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {activating ? "Activation..." : "Activer la session"}
            </button>
          </div>
        ) : (
          <div>
            {/* ── Tabs jury / invités ── */}
            {!projecting && (
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1 mb-5">
                <button
                  onClick={() => setQrTab("jury")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                    (qrTab ?? "jury") === "jury" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" /> Jury
                </button>
                <button
                  onClick={() => setQrTab("guests")}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                    qrTab === "guests" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> Invités
                </button>
              </div>
            )}

            {(qrTab === "guests") ? (
              <GuestQrSection
                session={session}
                qrDataUrl={qrGuestDataUrl}
                guestJoinUrl={guestJoinUrl}
                onProject={() => setProjecting(true)}
              />
            ) : (
            <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-slate-800">QR Code jury</h2>
              <a
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Ouvrir
              </a>
            </div>

            {/* QR centré */}
            <div className="flex flex-col items-center gap-4">
              {qrDataUrl ? (
                <button
                  onClick={() => setProjecting(true)}
                  title="Projeter en plein écran"
                  className="group relative bg-white rounded-2xl border-2 border-slate-200 p-4 shadow-sm hover:border-orange-300 transition-colors"
                >
                  <img src={qrDataUrl} alt="QR Code jury" className="w-56 h-56" />
                  <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                    <Maximize2 className="w-6 h-6 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ) : (
                <div className="w-56 h-56 rounded-2xl border-2 border-slate-200 flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-slate-200" />
                </div>
              )}

              {/* Nom + date */}
              <div className="text-center">
                <p className="font-semibold text-slate-800">{session.name}</p>
                {session.event_date && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(session.event_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                )}
              </div>

              {/* URL avec copie */}
              <div className="w-full flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-xs text-slate-500 flex-1 truncate font-mono">{joinUrl}</span>
                <button
                  onClick={copyJoinLink}
                  title="Copier le lien"
                  className="flex-shrink-0 text-slate-400 hover:text-orange-500 transition-colors"
                >
                  {copied
                    ? <Check className="w-4 h-4 text-green-500" />
                    : <Copy className="w-4 h-4" />
                  }
                </button>
              </div>

              {/* Boutons d'action */}
              <div className={`w-full grid gap-2 ${navigator.share ? "grid-cols-3" : "grid-cols-2"}`}>
                <button
                  onClick={downloadQr}
                  disabled={!qrDataUrl}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 py-3 text-xs font-medium text-slate-600 hover:border-orange-300 hover:text-orange-500 disabled:opacity-40 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Télécharger
                </button>
                <button
                  onClick={() => setProjecting(true)}
                  disabled={!qrDataUrl}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 py-3 text-xs font-medium text-slate-600 hover:border-orange-300 hover:text-orange-500 disabled:opacity-40 transition-colors"
                >
                  <Maximize2 className="w-4 h-4" />
                  Projeter
                </button>
                {navigator.share && (
                  <button
                    onClick={shareLink}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 py-3 text-xs font-medium text-slate-600 hover:border-orange-300 hover:text-orange-500 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Partager
                  </button>
                )}
              </div>
            </div>

            {/* Jurés connectés */}
            {(session.jury?.length || 0) > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-500 mb-2">
                  Jurés connectés : <span className="font-semibold text-slate-700">{session.jury.length}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {session.jury.map(j => (
                    <div key={j.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-1 pr-2.5 py-1">
                      {j.avatar?.startsWith("https://")
                        ? <img src={j.avatar} alt="" className="w-5 h-5 rounded-full" />
                        : <span className="text-sm leading-none">{j.avatar || "🧑"}</span>
                      }
                      <span className="text-xs text-slate-700">{j.pseudo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
            )}
          </div>
        )}
      </section>
    </div>

    {/* ── Mode projection plein écran ── */}
    {projecting && (
      <div
        className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center cursor-pointer select-none"
        onClick={() => setProjecting(false)}
      >
        <p className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-8">
          Scannez pour rejoindre le jury
        </p>
        <img
          src={qrDataUrl}
          alt="QR Code"
          className="w-[min(80vmin,480px)] h-[min(80vmin,480px)] rounded-2xl shadow-2xl"
        />
        <p className="text-3xl font-bold text-slate-900 mt-8">{session.name}</p>
        {session.event_date && (
          <p className="text-slate-400 mt-2">
            {new Date(session.event_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        )}
        <p className="text-sm text-slate-300 font-mono mt-6">{joinUrl}</p>
        <p className="text-xs text-slate-200 mt-10">Appuyez sur Échap ou cliquez pour fermer</p>
      </div>
    )}
    </>
  );
}
