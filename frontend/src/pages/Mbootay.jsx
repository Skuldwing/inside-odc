import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Plus,
  KanbanSquare,
  ArrowUpRight,
  Pencil,
  Trash2,
  Users,
  CalendarDays,
  CheckCircle2,
  ListTodo,
  AlertTriangle,
} from "lucide-react";
import api from "../api";
import AdminModal from "../components/admin/AdminModal";
import AdminSearchCard from "../components/admin/AdminSearchCard";

export const PROJECT_STATUSES = [
  { key: "non_demarre", label: "Non démarré", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" },
  { key: "en_cours", label: "En cours", dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700" },
  { key: "en_pause", label: "En pause", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700" },
  { key: "termine", label: "Terminé", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
];

export function projectStatusMeta(key) {
  return PROJECT_STATUSES.find((s) => s.key === key) || PROJECT_STATUSES[1];
}

const EMPTY_FORM = {
  title: "",
  description: "",
  status: "en_cours",
  owner_id: "",
  partner_id: "",
  device_id: "",
  start_date: "",
  due_date: "",
};

export default function Mbootay() {
  const [projects, setProjects] = useState([]);
  const [team, setTeam] = useState([]);
  const [partners, setPartners] = useState([]);
  const [devices, setDevices] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      const projectsRes = await api.get("/mbootay/projects");
      setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);

      const [teamRes, refsRes, tasksRes] = await Promise.allSettled([
        api.get("/mbootay/team"),
        api.get("/mbootay/references"),
        api.get("/mbootay/my-tasks"),
      ]);
      if (teamRes.status === "fulfilled" && Array.isArray(teamRes.value.data)) {
        setTeam(teamRes.value.data);
      }
      if (refsRes.status === "fulfilled") {
        setPartners(refsRes.value.data?.partners || []);
        setDevices(refsRes.value.data?.devices || []);
      }
      if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data)) {
        setMyTasks(tasksRes.value.data);
      }
    } catch (err) {
      console.error("Erreur chargement Mbootay", err);
      setError("Impossible de charger les projets Mbootay.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== "all" && (p.status || "en_cours") !== statusFilter) return false;
      if (!q) return true;
      return (
        (p.title || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.owner_name || "").toLowerCase().includes(q) ||
        (p.partner_name || "").toLowerCase().includes(q)
      );
    });
  }, [projects, search, statusFilter]);

  const stats = useMemo(() => {
    const total = projects.length;
    const enCours = projects.filter((p) => p.status === "en_cours").length;
    const termines = projects.filter((p) => p.status === "termine").length;
    const tasksOpen = projects.reduce(
      (acc, p) => acc + Math.max(0, Number(p.tasks_total || 0) - Number(p.tasks_done || 0)),
      0
    );
    return { total, enCours, termines, tasksOpen };
  }, [projects]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (project) => {
    setEditing(project);
    setForm({
      title: project.title || "",
      description: project.description || "",
      status: project.status || "en_cours",
      owner_id: project.owner_id ? String(project.owner_id) : "",
      partner_id: project.partner_id ? String(project.partner_id) : "",
      device_id: project.device_id ? String(project.device_id) : "",
      start_date: project.start_date ? String(project.start_date).slice(0, 10) : "",
      due_date: project.due_date ? String(project.due_date).slice(0, 10) : "",
    });
    setOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        status: form.status,
        owner_id: form.owner_id ? Number(form.owner_id) : null,
        partner_id: form.partner_id ? Number(form.partner_id) : null,
        device_id: form.device_id ? Number(form.device_id) : null,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
      };
      if (editing) {
        await api.put(`/mbootay/projects/${editing.id}`, payload);
      } else {
        await api.post("/mbootay/projects", payload);
      }
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await fetchAll();
    } catch (err) {
      console.error("Erreur enregistrement projet", err);
      alert(err.response?.data?.error || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project) => {
    if (!window.confirm(`Supprimer le projet "${project.title}" et toutes ses tâches ?`)) return;
    try {
      await api.delete(`/mbootay/projects/${project.id}`);
      await fetchAll();
    } catch (err) {
      console.error("Erreur suppression projet", err);
      alert("Suppression impossible");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <KanbanSquare className="w-6 h-6 text-orange-500" />
            Mbootay
          </h1>
          <p className="page-subtitle">
            L'espace de travail de l'équipe ODC : projets internes, tâches et échéances.
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" />
          Nouveau projet
        </button>
      </div>

      {error && (
        <div className="card p-4 flex items-center gap-3 text-sm text-red-700 bg-red-50/70 border-red-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile label="Projets" value={stats.total} icon={KanbanSquare} />
        <StatTile label="En cours" value={stats.enCours} icon={ListTodo} accent="text-orange-600" />
        <StatTile label="Terminés" value={stats.termines} icon={CheckCircle2} accent="text-emerald-600" />
        <StatTile label="Tâches ouvertes" value={stats.tasksOpen} icon={ListTodo} accent="text-slate-900" />
      </div>

      {myTasks.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ListTodo className="w-4 h-4 text-orange-500" />
            <p className="font-semibold text-slate-900">Mes tâches en cours</p>
            <span className="ml-auto text-xs text-slate-400">{myTasks.length}</span>
          </div>
          <div className="space-y-2">
            {myTasks.slice(0, 6).map((t) => (
              <Link
                key={t.id}
                to={`/mbootay/${t.project_id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition hover:border-orange-200 hover:bg-orange-50/40"
              >
                <span className="text-sm text-slate-800 flex-1 truncate">{t.title}</span>
                <span className="text-xs text-slate-400 hidden sm:block truncate max-w-[150px]">
                  {t.project_title}
                </span>
                {t.due_date && <DueBadge date={t.due_date} />}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1">
          <AdminSearchCard
            placeholder="Rechercher un projet..."
            value={search}
            onChange={setSearch}
          />
        </div>
        <div className="card p-4 flex flex-wrap items-center gap-2">
          <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            Tous
          </FilterChip>
          {PROJECT_STATUSES.map((s) => (
            <FilterChip
              key={s.key}
              active={statusFilter === s.key}
              onClick={() => setStatusFilter(s.key)}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              {s.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-500">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <KanbanSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">
            {projects.length === 0 ? "Aucun projet pour le moment" : "Aucun projet ne correspond au filtre"}
          </p>
          {projects.length === 0 && (
            <p className="text-sm text-slate-500 mt-1">
              Créez votre premier projet interne pour lancer Mbootay.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p, index) => (
            <ProjectCard
              key={p.id}
              project={p}
              index={index}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}

      {open && (
        <AdminModal
          title={editing ? "Modifier le projet" : "Nouveau projet"}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Titre *</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Refonte du parcours d'accueil"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                className="input"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Objectif, périmètre, livrables attendus..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                <select
                  className="select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Responsable</label>
                <select
                  className="select"
                  value={form.owner_id}
                  onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
                >
                  <option value="">Non assigné</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Début</label>
                <input
                  type="date"
                  className="input"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Échéance</label>
                <input
                  type="date"
                  className="input"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Partenaire lié <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <select
                  className="select"
                  value={form.partner_id}
                  onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
                >
                  <option value="">Aucun</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Dispositif lié <span className="text-slate-400 font-normal">(optionnel)</span>
                </label>
                <select
                  className="select"
                  value={form.device_id}
                  onChange={(e) => setForm({ ...form, device_id: e.target.value })}
                >
                  <option value="">Aucun</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost border">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, accent = "text-slate-900" }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-slate-500 mb-1">
        <Icon className="w-4 h-4" />
        <p className="text-xs">{label}</p>
      </div>
      <p className={`text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function DueBadge({ date }) {
  const due = parseISO(String(date).slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const late = due < today;
  return (
    <span
      className={`badge ${
        late ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-100 border-slate-200 text-slate-600"
      }`}
    >
      {format(due, "d MMM", { locale: fr })}
    </span>
  );
}

function ProjectCard({ project, index, onEdit, onDelete }) {
  const meta = projectStatusMeta(project.status);
  const total = Number(project.tasks_total || 0);
  const done = Number(project.tasks_done || 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="card p-5 space-y-4 anim-fade-in-up transition hover:shadow-md hover:shadow-slate-300/60"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to={`/mbootay/${project.id}`}
            className="font-semibold text-slate-900 hover:text-orange-600 transition block truncate"
          >
            {project.title}
          </Link>
          <span className={`badge mt-1.5 border-transparent ${meta.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={`/mbootay/${project.id}`}
            title="Ouvrir le projet"
            className="text-slate-500 hover:text-orange-500"
          >
            <ArrowUpRight className="w-4 h-4" />
          </Link>
          <button onClick={onEdit} className="text-slate-500 hover:text-orange-500" title="Modifier">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="text-slate-500 hover:text-red-500" title="Supprimer">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">
        {project.description || "Aucune description"}
      </p>

      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Avancement</span>
          <span className="font-medium text-slate-700">{done}/{total} tâches</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 pt-1 border-t border-slate-100">
        <span className="flex items-center gap-1.5 pt-2">
          <Users className="w-3.5 h-3.5" />
          {project.owner_name || "Sans responsable"}
        </span>
        {project.due_date && (
          <span className="flex items-center gap-1.5 pt-2">
            <CalendarDays className="w-3.5 h-3.5" />
            {format(parseISO(String(project.due_date).slice(0, 10)), "d MMM yyyy", { locale: fr })}
          </span>
        )}
        {Number(project.members_count || 0) > 0 && (
          <span className="pt-2">{project.members_count} membre{project.members_count > 1 ? "s" : ""}</span>
        )}
      </div>
    </div>
  );
}
