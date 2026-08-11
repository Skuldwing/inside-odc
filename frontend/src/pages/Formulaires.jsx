import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, FileText, Pencil, Trash2, Link2, ExternalLink,
  Copy, ToggleLeft, ToggleRight, Users,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminPageHeader from "../components/admin/AdminPageHeader";
import AdminSearchCard from "../components/admin/AdminSearchCard";

/* ── FormCard ── */
function FormCard({ form, onEdit, onDelete, onCopyLink, onToggleStatus, onDuplicate }) {
  const isActive  = form.status === "active";
  const responses = Number(form.submissions_count || 0);

  return (
    <div className="card flex flex-col hover:shadow-md transition-shadow">
      <div className={`h-1 rounded-t-2xl ${isActive ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-slate-200"}`} />
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 truncate leading-tight">{form.title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">/f/{form.slug}</p>
          </div>
          <button
            type="button"
            onClick={() => onToggleStatus(form)}
            title={isActive ? "Désactiver" : "Activer"}
            className="flex-shrink-0 mt-0.5 transition-transform hover:scale-105"
          >
            {isActive
              ? <ToggleRight className="w-8 h-8 text-emerald-500" />
              : <ToggleLeft  className="w-8 h-8 text-slate-300" />
            }
          </button>
        </div>

        {form.description && (
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{form.description}</p>
        )}

        <div className="flex items-center gap-2 mt-auto">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"
          }`}>
            {isActive ? "Actif" : "Brouillon"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Users className="w-3.5 h-3.5" />
            {responses} réponse{responses !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
          <button type="button" className="btn-primary flex-1 text-xs py-1.5" onClick={() => onEdit(form.id)}>
            <Pencil className="w-3.5 h-3.5" />
            Modifier
          </button>
          <button type="button" className="btn-ghost border p-2" onClick={() => onCopyLink(form.slug)} title="Copier le lien public">
            <Link2 className="w-4 h-4" />
          </button>
          {isActive && (
            <a
              href={`${window.location.origin}/f/${form.slug}`}
              target="_blank" rel="noopener noreferrer"
              className="btn-ghost border p-2"
              title="Ouvrir le formulaire"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button type="button" className="btn-ghost border p-2" onClick={() => onDuplicate(form.id)} title="Dupliquer">
            <Copy className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="btn-ghost border p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
            onClick={() => onDelete(form.id)}
            title="Supprimer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Page liste des formulaires
══════════════════════════════════════════ */
export default function Formulaires() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const querySearch = searchParams.get("q") || "";

  const [forms, setForms]               = useState([]);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState("");

  const fetchForms = async () => {
    setLoading(true); setError("");
    try {
      const res = await api.get("/forms");
      setForms(res.data || []);
    } catch {
      setError("Erreur chargement formulaires");
      setForms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchForms(); }, []);
  useEffect(() => { setSearch(querySearch); }, [querySearch]);
  useEffect(() => {
    if (searchParams.get("action") === "new") navigate("/formulaires/new", { replace: true });
  }, [searchParams, navigate]);

  const stats = useMemo(() => ({
    total:     forms.length,
    active:    forms.filter(f => f.status === "active").length,
    responses: forms.reduce((s, f) => s + Number(f.submissions_count || 0), 0),
  }), [forms]);

  const filteredForms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forms.filter(f => {
      if (statusFilter === "active" && f.status !== "active") return false;
      if (statusFilter === "draft"  && f.status !== "draft")  return false;
      if (!q) return true;
      return String(f.title || "").toLowerCase().includes(q) || String(f.slug || "").toLowerCase().includes(q);
    });
  }, [forms, search, statusFilter]);

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce formulaire définitivement ?")) return;
    try { await api.delete(`/forms/${id}`); await fetchForms(); }
    catch { alert("Erreur suppression formulaire"); }
  };

  const handleCopyPublicLink = async (slug) => {
    const link = `${window.location.origin}/f/${slug}`;
    try { await navigator.clipboard.writeText(link); alert("Lien copié !"); }
    catch { alert(link); }
  };

  const handleToggleStatus = async (form) => {
    const newStatus = form.status === "active" ? "draft" : "active";
    try {
      await api.patch(`/forms/${form.id}/status`, { status: newStatus });
      setForms(prev => prev.map(f => f.id === form.id ? { ...f, status: newStatus } : f));
    } catch { alert("Erreur changement statut"); }
  };

  const handleDuplicate = async (id) => {
    try { await api.post(`/forms/${id}/duplicate`); await fetchForms(); }
    catch { alert("Erreur duplication formulaire"); }
  };

  return (
    <AdminPinGate>
      <div className="space-y-6">
        <AdminPageHeader
          title="Formulaires"
          subtitle="Créez et gérez vos formulaires d'inscription et d'enquête"
          buttonLabel="Nouveau formulaire"
          buttonIcon={Plus}
          onAdd={() => navigate("/formulaires/new")}
        />

        {/* Stats */}
        {forms.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 leading-none">{stats.total}</p>
                <p className="text-xs text-slate-500 mt-0.5">Formulaire{stats.total !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <ToggleRight className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 leading-none">{stats.active}</p>
                <p className="text-xs text-slate-500 mt-0.5">Actif{stats.active !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900 leading-none">{stats.responses}</p>
                <p className="text-xs text-slate-500 mt-0.5">Réponse{stats.responses !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </div>
        )}

        {/* Recherche + filtre */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <AdminSearchCard placeholder="Rechercher un formulaire…" value={search} onChange={setSearch} />
          </div>
          <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden text-sm font-medium h-[42px]">
            {[
              { id: "all",    label: "Tous",       count: stats.total },
              { id: "active", label: "Actifs",     count: stats.active },
              { id: "draft",  label: "Brouillons", count: stats.total - stats.active },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${
                  statusFilter === f.id ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                {f.label}
                <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-semibold ${
                  statusFilter === f.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}>{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="card p-6 text-center text-slate-500 text-sm">Chargement…</div>
        ) : filteredForms.length === 0 ? (
          <div className="card p-10 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto mb-3 text-slate-200" />
            <p className="font-medium text-slate-500 mb-1">Aucun formulaire trouvé</p>
            <p className="text-sm mb-4">
              {search ? "Essaie un autre mot-clé." : "Crée ton premier formulaire."}
            </p>
            {!search && (
              <button type="button" className="btn-primary mx-auto" onClick={() => navigate("/formulaires/new")}>
                <Plus className="w-4 h-4" /> Nouveau formulaire
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredForms.map(form => (
              <FormCard
                key={form.id}
                form={form}
                onEdit={id => navigate(`/formulaires/${id}/edit`)}
                onDelete={handleDelete}
                onCopyLink={handleCopyPublicLink}
                onToggleStatus={handleToggleStatus}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        )}
      </div>
    </AdminPinGate>
  );
}
