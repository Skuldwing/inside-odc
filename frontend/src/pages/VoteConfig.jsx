import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Play, Plus, Trash2, Edit2, Check, X, Loader2, QrCode, Copy, ExternalLink,
} from "lucide-react";
import api from "../api";

const AVATARS = ["🧑","👩","👨","😎","🤓","🦸","🧙","🎓","🏆","⭐","🚀","💡","🎯","🔥","💪","🌟","🦁","🐯","🦊","🐺"];

const STATUS_LABEL = { draft: "Brouillon", active: "En cours", closed: "Termine" };
const STATUS_CLS   = { draft: "bg-slate-100 text-slate-600", active: "bg-orange-100 text-orange-700", closed: "bg-green-100 text-green-700" };

export default function VoteConfig() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");

  /* editable session info */
  const [editInfo, setEditInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ name: "", event_date: "" });
  const [savingInfo, setSavingInfo] = useState(false);

  /* project form */
  const [showProjForm, setShowProjForm] = useState(false);
  const [projForm, setProjForm] = useState({ name: "", porteur: "", description: "" });
  const [savingProj, setSavingProj] = useState(false);
  const [editingProj, setEditingProj] = useState(null);

  /* criteria form */
  const [showCritForm, setShowCritForm] = useState(false);
  const [critForm, setCritForm] = useState({ name: "", scale: 10, weight: 1 });
  const [savingCrit, setSavingCrit] = useState(false);
  const [editingCrit, setEditingCrit] = useState(null);

  const [activating, setActivating] = useState(false);

  const fetch = async () => {
    try {
      const r = await api.get(`/vote/sessions/${id}`);
      setSession(r.data);
      setInfoForm({ name: r.data.name, event_date: r.data.event_date ? String(r.data.event_date).slice(0, 10) : "" });
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
      const url = `${window.location.origin}/vote/join/${sid}`;
      const dataUrl = await QRCode.default.toDataURL(url, { width: 300, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch {}
  };

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
    if (session.criteria?.length === 0) { setError("Ajoutez au moins un critere avant d'activer."); return; }
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
    setProjForm({ name: p.name, porteur: p.porteur || "", description: p.description || "" });
    setShowProjForm(true);
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
      setCritForm({ name: "", scale: 10, weight: 1 });
      setShowCritForm(false);
    } catch { setError("Erreur sauvegarde critere."); }
    setSavingCrit(false);
  };

  const deleteCriterion = async (cid) => {
    if (!confirm("Supprimer ce critere ?")) return;
    try {
      await api.delete(`/vote/sessions/${id}/criteria/${cid}`);
      setSession(s => ({ ...s, criteria: s.criteria.filter(c => c.id !== cid) }));
    } catch { setError("Erreur suppression."); }
  };

  const startEditCrit = (c) => {
    setEditingCrit(c.id);
    setCritForm({ name: c.name, scale: c.scale, weight: c.weight });
    setShowCritForm(true);
  };

  const copyJoinLink = () => {
    const url = `${window.location.origin}/vote/join/${id}`;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-orange-400" /></div>;
  if (error && !session) return <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">{error}</div>;

  const joinUrl = `${window.location.origin}/vote/join/${id}`;
  const badge = STATUS_CLS[session.status] || STATUS_CLS.draft;

  return (
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
            <Play className="w-4 h-4" /> Gerer en direct
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
            <button onClick={saveInfo} disabled={savingInfo} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
              {savingInfo ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        ) : (
          <div className="text-sm text-slate-700 space-y-1">
            <p><span className="text-slate-500">Nom :</span> {session.name}</p>
            <p><span className="text-slate-500">Date :</span> {session.event_date ? new Date(session.event_date).toLocaleDateString("fr-FR") : "—"}</p>
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
              <label className="text-xs font-medium text-slate-600">Porteur / Equipe</label>
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" placeholder="Equipe Alpha" value={projForm.porteur} onChange={e => setProjForm(p => ({ ...p, porteur: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Description</label>
              <textarea rows={2} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none resize-none" placeholder="Courte description du projet..." value={projForm.description} onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))} />
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
            Criteres de notation <span className="text-slate-400 font-normal text-sm">({session.criteria?.length || 0})</span>
          </h2>
          {session.status === "draft" && (
            <button
              onClick={() => { setEditingCrit(null); setCritForm({ name: "", scale: 10, weight: 1 }); setShowCritForm(v => !v); }}
              className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-600 font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          )}
        </div>

        {session.criteria?.length === 0 && !showCritForm && (
          <p className="text-sm text-slate-400 italic">Aucun critere ajoute</p>
        )}

        <div className="space-y-2 mb-3">
          {session.criteria?.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex-1">
                <p className="font-medium text-sm text-slate-800">{c.name}</p>
                <p className="text-xs text-slate-500">Note sur {c.scale} · Poids {c.weight}</p>
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
            <p className="text-xs font-semibold text-orange-700">{editingCrit ? "Modifier le critere" : "Nouveau critere"}</p>
            <div>
              <label className="text-xs font-medium text-slate-600">Intitule *</label>
              <input required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none" placeholder="Innovation" value={critForm.name} onChange={e => setCritForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Echelle de note</label>
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
              Une fois activee, les jures pourront rejoindre via le QR code. Assurez-vous d&apos;avoir ajoute vos projets et criteres.
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
            <h2 className="font-semibold text-slate-800 mb-4">QR Code jury</h2>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              {qrDataUrl ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
                  <img src={qrDataUrl} alt="QR Code jury" className="w-40 h-40" />
                </div>
              ) : (
                <div className="w-40 h-40 rounded-2xl border border-slate-200 flex items-center justify-center">
                  <QrCode className="w-8 h-8 text-slate-300" />
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm text-slate-500 mb-3">Partagez ce lien ou ce QR code avec les jures pour qu&apos;ils puissent rejoindre la session :</p>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 mb-3">
                  <span className="text-xs text-slate-600 flex-1 truncate font-mono">{joinUrl}</span>
                  <button onClick={copyJoinLink} className="flex-shrink-0 text-slate-400 hover:text-orange-500 transition-colors">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <a
                  href={joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-orange-500 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ouvrir la page jury
                </a>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-2">Jures connectes : <span className="font-semibold text-slate-700">{session.jury?.length || 0}</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {session.jury?.map(j => (
                      <span key={j.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                        <span>{j.avatar}</span> {j.pseudo}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
