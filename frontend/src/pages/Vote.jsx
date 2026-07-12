import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Award, Settings, Play, Trash2, Users, Calendar, Loader2, BarChart3 } from "lucide-react";
import api from "../api";

const STATUS_BADGE = {
  draft:  { label: "Brouillon",  cls: "bg-slate-100 text-slate-600" },
  active: { label: "En cours",   cls: "bg-orange-100 text-orange-700" },
  closed: { label: "Termine",    cls: "bg-green-100 text-green-700" },
};

export default function Vote() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", event_date: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const fetchSessions = async () => {
    try {
      const r = await api.get("/vote/sessions");
      setSessions(r.data);
    } catch {
      setError("Impossible de charger les sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const r = await api.post("/vote/sessions", form);
      navigate(`/vote/${r.data.id}`);
    } catch {
      setError("Erreur lors de la creation.");
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cette session et toutes ses donnees ?")) return;
    try {
      await api.delete(`/vote/sessions/${id}`);
      setSessions(s => s.filter(x => x.id !== id));
    } catch {
      setError("Erreur lors de la suppression.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sessions de vote</h1>
          <p className="text-sm text-slate-500 mt-0.5">Hackathons, concours de projets, jury notation</p>
        </div>
        <button
          onClick={() => setShowNew(v => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouvelle session
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {showNew && (
        <form onSubmit={handleCreate} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Nouvelle session</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600">Nom de l&apos;evenement *</label>
              <input
                required
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="Hackathon Orange 2026"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Date de l&apos;evenement</label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                value={form.event_date}
                onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creation..." : "Creer et configurer"}
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucune session de vote</p>
          <p className="text-sm mt-1">Creez une session pour commencer</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => {
            const badge = STATUS_BADGE[s.status] || STATUS_BADGE.draft;
            return (
              <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-slate-900 truncate">{s.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                    {s.event_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(s.event_date).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Award className="w-3 h-3" />
                      {s.projects_count} projet{s.projects_count !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {s.jury_count} jure{s.jury_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => navigate(`/vote/${s.id}`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" /> Configurer
                  </button>
                  {s.status === "active" && (
                    <button
                      onClick={() => navigate(`/vote/${s.id}/manage`)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" /> Gerer
                    </button>
                  )}
                  {s.status === "closed" && (
                    <button
                      onClick={() => navigate(`/vote/${s.id}/manage`)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> Resultats
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="rounded-xl p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
