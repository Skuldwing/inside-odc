import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
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
  ClipboardCheck,
  ListTodo,
  AlertTriangle,
  Circle,
  Clock3,
  Briefcase,
  Activity,
  FileText,
  Target,
  ArrowRight,
  Search,
  Building2,
  Layers,
  ChevronLeft,
  ChevronRight,
  X,
  GripVertical,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";
import AdminModal from "../components/admin/AdminModal";
import { useToast, useConfirm, EmptyState } from "../components/ui";

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

const EMPTY_CHECKLIST_FORM = { title: "", description: "", status: "a_faire", assigned_to: "", due_date: "" };
const CHECKLIST_STATUSES = [
  { key: "a_faire", label: "À faire", dot: "bg-slate-500", chip: "bg-slate-100 text-slate-700 border-slate-200", selected: "bg-slate-700 text-white border-slate-700" },
  { key: "en_cours", label: "En cours", dot: "bg-orange-500", chip: "bg-orange-100 text-orange-800 border-orange-200", selected: "bg-orange-600 text-white border-orange-600" },
  { key: "en_pause", label: "En pause", dot: "bg-amber-500", chip: "bg-amber-100 text-amber-800 border-amber-200", selected: "bg-amber-500 text-white border-amber-500" },
  { key: "termine", label: "Terminé", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-800 border-emerald-200", selected: "bg-emerald-600 text-white border-emerald-600" },
  { key: "annule", label: "Annulé", dot: "bg-rose-500", chip: "bg-rose-100 text-rose-800 border-rose-200", selected: "bg-rose-600 text-white border-rose-600" },
];

function dateKey(date) {
  return format(date, "yyyy-MM-dd");
}

function projectMatchesWeek(project, weekStart) {
  const start = project.start_date ? String(project.start_date).slice(0, 10) : "";
  const end = project.due_date ? String(project.due_date).slice(0, 10) : "";
  if (!start && !end) return false;
  const weekEnd = dateKey(addDays(parseISO(weekStart), 6));
  if (start && !end) return start >= weekStart && start <= weekEnd;
  if (!start && end) return end >= weekStart && end <= weekEnd;
  return (!start || start <= weekEnd) && (!end || end >= weekStart);
}

export default function Mbootay() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();

  const [projects, setProjects] = useState([]);
  const [team, setTeam] = useState([]);
  const [partners, setPartners] = useState([]);
  const [devices, setDevices] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [checklistTasks, setChecklistTasks] = useState([]);
  const [weeklyPlans, setWeeklyPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const activeSection = ["suivi", "taches", "projets", "checklist"].includes(requestedSection) ? requestedSection : "suivi";
  const setActiveSection = (section) => {
    const nextParams = new URLSearchParams(searchParams);
    if (section === "suivi") nextParams.delete("section");
    else nextParams.set("section", section);
    setSearchParams(nextParams, { replace: true });
  };

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [projectMemberIds, setProjectMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [checklistFormOpen, setChecklistFormOpen] = useState(false);
  const [checklistEditing, setChecklistEditing] = useState(null);
  const [checklistForm, setChecklistForm] = useState(EMPTY_CHECKLIST_FORM);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const currentWeek = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const selectedWeek = useMemo(() => addWeeks(currentWeek, weekOffset), [currentWeek, weekOffset]);
  const nextWeek = useMemo(() => addWeeks(selectedWeek, 1), [selectedWeek]);

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      const projectsRes = await api.get("/mbootay/projects");
      setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);

      const [teamRes, refsRes, tasksRes, checklistRes] = await Promise.allSettled([
        api.get("/mbootay/team"),
        api.get("/mbootay/references"),
        api.get("/mbootay/my-tasks"),
        api.get("/mbootay/checklist"),
      ]);
      const weeklyRes = await api.get("/mbootay/weekly-plans", {
        params: { from: dateKey(selectedWeek), to: dateKey(nextWeek) },
      }).catch(() => null);
      if (weeklyRes && Array.isArray(weeklyRes.data)) setWeeklyPlans(weeklyRes.data);
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
      if (checklistRes.status === "fulfilled" && Array.isArray(checklistRes.value.data)) {
        setChecklistTasks(checklistRes.value.data);
      }
    } catch (err) {
      console.error("Erreur chargement Mbootay", err);
      setError("Impossible de charger les projets Mbootay.");
    } finally {
      setLoading(false);
    }
  }, [selectedWeek, nextWeek]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter === "open" && p.status === "termine") return false;
      if (statusFilter !== "all" && statusFilter !== "open" && (p.status || "en_cours") !== statusFilter) return false;
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
    setProjectMemberIds([]);
    setOpen(true);
  };

  const openEdit = async (project) => {
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
    setProjectMemberIds([]);
    setOpen(true);
    try {
      const membersRes = await api.get(`/mbootay/projects/${project.id}/members`);
      setProjectMemberIds(Array.isArray(membersRes.data) ? membersRes.data.map((member) => Number(member.id)) : []);
    } catch (err) {
      toast.error("Impossible de charger l’équipe de ce projet.");
    }
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
      let projectId = editing?.id;
      if (editing) {
        await api.put(`/mbootay/projects/${editing.id}`, payload);
      } else {
        const created = await api.post("/mbootay/projects", payload);
        projectId = created.data?.id;
      }
      await api.put(`/mbootay/projects/${projectId}/members`, { user_ids: projectMemberIds });
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setProjectMemberIds([]);
      toast.success(editing ? "Projet mis à jour." : "Projet créé.");
      await fetchAll();
    } catch (err) {
      console.error("Erreur enregistrement projet", err);
      toast.error(err.response?.data?.error || "Erreur lors de l'enregistrement du projet.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project) => {
    const ok = await confirm({
      title: `Supprimer « ${project.title} » ?`,
      body: "Le projet et toutes ses tâches seront définitivement supprimés.",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/mbootay/projects/${project.id}`);
      toast.success("Projet supprimé.");
      await fetchAll();
    } catch (err) {
      console.error("Erreur suppression projet", err);
      toast.error("Suppression impossible.");
    }
  };

  const openNewChecklistTask = (status = "a_faire") => {
    setChecklistEditing(null);
    setChecklistForm({ ...EMPTY_CHECKLIST_FORM, status });
    setChecklistFormOpen(true);
  };

  const openEditChecklistTask = (task) => {
    setChecklistEditing(task.id);
    setChecklistForm({
      title: task.title || "",
      description: task.description || "",
      status: task.status || "a_faire",
      assigned_to: task.assigned_to ? String(task.assigned_to) : "",
      due_date: task.due_date ? String(task.due_date).slice(0, 10) : "",
    });
    setChecklistFormOpen(true);
  };

  const saveChecklistTask = async (event) => {
    event.preventDefault();
    if (!checklistForm.title.trim()) return;
    setChecklistSaving(true);
    const payload = {
      ...checklistForm,
      title: checklistForm.title.trim(),
      description: checklistForm.description.trim() || null,
      assigned_to: checklistForm.assigned_to ? Number(checklistForm.assigned_to) : null,
      due_date: checklistForm.due_date || null,
    };
    try {
      if (checklistEditing) {
        await api.put(`/mbootay/checklist/${checklistEditing}`, payload);
        toast.success("Tâche modifiée.");
      } else {
        await api.post("/mbootay/checklist", payload);
        toast.success("Tâche ajoutée à la checklist.");
      }
      setChecklistFormOpen(false);
      setChecklistEditing(null);
      setChecklistForm(EMPTY_CHECKLIST_FORM);
      await fetchAll();
    } catch (err) {
      const message = err.response?.status === 404 && err.response?.data?.error === "Route introuvable"
        ? "Le serveur Mbootay n’a pas encore chargé la route Checklist. Redémarre ou redéploie le backend, puis réessaie."
        : err.response?.data?.error || "Impossible d’enregistrer la tâche.";
      toast.error(message);
    } finally {
      setChecklistSaving(false);
    }
  };

  const changeChecklistTaskStatus = async (task, status) => {
    try {
      await api.patch(`/mbootay/checklist/${task.id}/status`, { status });
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || "Impossible de modifier le statut.");
    }
  };

  const deleteChecklistTask = async (task) => {
    const ok = await confirm({ title: `Supprimer « ${task.title} » ?`, body: "Cette tâche sera retirée de la checklist partagée.", destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/mbootay/checklist/${task.id}`);
      toast.success("Tâche supprimée.");
      await fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || "Impossible de supprimer la tâche.");
    }
  };

  const addWeeklyItem = async (weekStart, title, parentId = null, eventDate = null) => {
    if (!title.trim()) return;
    try {
      await api.post(`/mbootay/weekly-plans/${weekStart}/items`, { title: title.trim(), parent_id: parentId, event_date: eventDate || null });
      toast.success(parentId ? "Sous-point ajouté à la liste." : "Grand point ajouté à la liste.");
      await fetchAll();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || "Impossible d'ajouter ce point.");
      return false;
    }
  };

  const toggleWeeklyItem = async (item) => {
    try {
      await api.patch(`/mbootay/weekly-items/${item.id}`, { done: !item.done });
      await fetchAll();
    } catch (err) {
      toast.error("La checklist n'a pas pu être mise à jour.");
    }
  };

  const editWeeklyItem = async (item, changes) => {
    try {
      await api.patch(`/mbootay/weekly-items/${item.id}`, changes);
      toast.success("Point de suivi modifié.");
      await fetchAll();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || "Impossible de modifier ce point.");
      return false;
    }
  };

  const deleteWeeklyItem = async (item) => {
    const ok = await confirm({ title: `Supprimer « ${item.title} » ?`, body: "Le point et ses sous-points seront supprimés.", destructive: true });
    if (!ok) return;
    try {
      await api.delete(`/mbootay/weekly-items/${item.id}`);
      toast.success("Point supprimé.");
      await fetchAll();
    } catch (err) {
      toast.error("Impossible de supprimer ce point.");
    }
  };

  const planFor = (weekStart) => weeklyPlans.find((plan) => String(plan.week_start).slice(0, 10) === dateKey(weekStart));

  return (
    <div className="space-y-8 pb-8">
      <header className="relative isolate w-full overflow-hidden rounded-[20px] bg-slate-950 px-4 py-3 text-white shadow-lg shadow-slate-900/10 sm:px-6 sm:py-3.5">
        <div className="absolute -right-12 -top-20 -z-10 h-72 w-72 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="absolute bottom-0 right-24 -z-10 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-orange-200">
              <KanbanSquare className="h-3 w-3" /> ORANGE DIGITAL CENTER · SONATEL
            </span>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">Mbootay</h1>
            <p className="mt-1 max-w-xl text-xs leading-4 text-slate-300 sm:text-sm">
              Les priorités de la semaine, les projets de l’équipe et leur progression au même endroit.
            </p>
          </div>
          <button onClick={openCreate} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-950/20 transition hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2 focus:ring-offset-slate-950">
            <Plus className="h-4 w-4" /> Nouveau projet <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <nav className="grid grid-cols-2 gap-2 rounded-2xl border border-orange-100 bg-orange-50 p-2 sm:grid-cols-4" aria-label="Sections Mbootay">
        {[
          { key: "suivi", label: "Suivi", icon: CalendarDays },
          { key: "taches", label: "Mes tâches", icon: ListTodo },
          { key: "projets", label: "Projets de l’équipe", icon: Briefcase },
          { key: "checklist", label: "Checklist", icon: ClipboardCheck },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => setActiveSection(key)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${activeSection === key ? "bg-orange-500 text-white shadow-md shadow-orange-200" : "bg-white text-orange-800 hover:bg-orange-100"}`} aria-current={activeSection === key ? "page" : undefined}>
            <Icon className="h-4 w-4" />{label}
            {key === "taches" && myTasks.length > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${activeSection === key ? "bg-white/20 text-white" : "bg-orange-100 text-orange-800"}`}>{myTasks.length}</span>}
          </button>
        ))}
      </nav>

      {error && (
        <div className="card p-4 flex items-center gap-3 text-sm text-red-700 bg-red-50/70 border-red-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {activeSection === "suivi" && <section className="space-y-5 rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-orange-700">
              <CalendarDays className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Ordre du jour partagé</span>
            </div>
            <h2 className="text-xl font-bold text-slate-950">Prévisions et suivi de l’équipe</h2>
            <p className="mt-1 text-sm text-slate-700">Ajoutez les grands points prévus, puis détaillez-les en sous-points à cocher. Toute l’équipe Mbootay peut contribuer.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" aria-label="Voir les semaines précédentes"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setWeekOffset(0)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cette semaine</button>
            <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50" aria-label="Voir les semaines suivantes"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <WeeklyColumn
            title={weekOffset === 0 ? "Suivi de cette semaine" : "Suivi de la semaine"}
            range={`Semaine du ${format(selectedWeek, "d MMMM yyyy", { locale: fr })}`}
            weekStart={dateKey(selectedWeek)}
            items={planFor(selectedWeek)?.items || []}
            onAdd={addWeeklyItem}
            onToggle={toggleWeeklyItem}
            onEdit={editWeeklyItem}
            onDelete={deleteWeeklyItem}
            projects={projects.filter((project) => projectMatchesWeek(project, dateKey(selectedWeek)))}
            isCurrentWeek={dateKey(selectedWeek) === dateKey(currentWeek)}
          />
          <WeeklyColumn
            title="Suivi de la semaine suivante"
            range={`Semaine du ${format(nextWeek, "d MMMM", { locale: fr })}`}
            weekStart={dateKey(nextWeek)}
            items={planFor(nextWeek)?.items || []}
            onAdd={addWeeklyItem}
            onToggle={toggleWeeklyItem}
            onEdit={editWeeklyItem}
            onDelete={deleteWeeklyItem}
            projects={projects.filter((project) => projectMatchesWeek(project, dateKey(nextWeek)))}
            isCurrentWeek={dateKey(nextWeek) === dateKey(currentWeek)}
          />
        </div>
        <p className="text-xs font-medium text-slate-700">Les listes sont partagées avec l’équipe. Naviguez vers les semaines précédentes pour corriger ou compléter un ancien suivi; les grands points peuvent porter une date d’événement.</p>
      </section>}

      {activeSection === "taches" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Mon espace de travail</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Mes tâches</h2>
              <p className="mt-1 text-sm text-slate-600">Les tâches qui te sont assignées dans les projets de l’équipe.</p>
            </div>
            <span className="rounded-full bg-orange-100 px-3 py-1.5 text-sm font-bold text-orange-800">{myTasks.length} tâche{myTasks.length === 1 ? "" : "s"}</span>
          </div>
          {myTasks.length === 0 ? <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-center"><ListTodo className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-semibold text-slate-800">Aucune tâche assignée</p><p className="mt-1 text-sm text-slate-500">Quand une tâche de projet te sera attribuée, elle apparaîtra ici.</p></div> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {myTasks.map((t) => (
              <Link
                key={t.id}
                to={`/mbootay/${t.project_id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><ListTodo className="h-4 w-4" /></span>{t.due_date && <DueBadge date={t.due_date} />}</div>
                <p className="mt-3 font-bold text-slate-900 group-hover:text-orange-700">{t.title}</p>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">{t.project_title}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-orange-700">Ouvrir le projet <ArrowUpRight className="h-3.5 w-3.5" /></span>
              </Link>
            ))}
          </div>
          )}
        </section>
      )}

      {activeSection === "projets" && <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 sm:gap-4">
          <StatTile label="Projets suivis" value={stats.total} icon={Briefcase} tone="orange" hint="dans l’espace équipe" />
          <StatTile label="En cours" value={stats.enCours} icon={Activity} tone="amber" hint="actifs maintenant" />
          <StatTile label="Terminés" value={stats.termines} icon={CheckCircle2} tone="green" hint="projets clôturés" />
          <StatTile label="Points ouverts" value={stats.tasksOpen} icon={ListTodo} tone="slate" hint="à faire dans les projets" />
        </div>
        <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Espace projets</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Les projets de l’équipe</h2>
            <p className="mt-1 text-sm text-slate-500">Retrouvez les objectifs, les responsables et l’avancement de chaque projet.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{filtered.length} résultat{filtered.length === 1 ? "" : "s"}</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1 xl:max-w-xl">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" className="input !rounded-xl !py-3 !pl-10" placeholder="Rechercher un projet, une personne…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Tous</FilterChip>
              <FilterChip active={statusFilter === "open"} onClick={() => setStatusFilter("open")}>
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />Projets en cours
              </FilterChip>
              <FilterChip active={statusFilter === "termine"} onClick={() => setStatusFilter("termine")}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Projets terminés
              </FilterChip>
              {PROJECT_STATUSES.filter((s) => ["non_demarre", "en_pause"].includes(s.key)).map((s) => (
                <FilterChip key={s.key} active={statusFilter === s.key} onClick={() => setStatusFilter(s.key)}>
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="card p-8 text-center text-slate-500">Chargement...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title={projects.length === 0 ? "Aucun projet pour le moment" : "Aucun projet ne correspond au filtre"}
          description={
            projects.length === 0
              ? "Créez votre premier projet interne : titre, responsable, échéance, puis des tâches à suivre en Kanban ou au calendrier."
              : "Modifiez la recherche ou le filtre de statut pour retrouver vos projets."
          }
          actionLabel={projects.length === 0 ? "Créer un projet" : "Réinitialiser les filtres"}
          actionIcon={projects.length === 0 ? Plus : undefined}
          onAction={
            projects.length === 0
              ? openCreate
              : () => { setSearch(""); setStatusFilter("all"); }
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p, index) => (
            <ProjectCard
              key={p.id}
              project={p}
              index={index}
              currentUserId={user?.id}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}
      </div>}

      {activeSection === "checklist" && (
        <StandaloneChecklist
          tasks={checklistTasks}
          team={team}
          formOpen={checklistFormOpen}
          editing={Boolean(checklistEditing)}
          form={checklistForm}
          setForm={setChecklistForm}
          saving={checklistSaving}
          onOpenForm={openNewChecklistTask}
          onCloseForm={() => { setChecklistFormOpen(false); setChecklistEditing(null); setChecklistForm(EMPTY_CHECKLIST_FORM); }}
          onSubmit={saveChecklistTask}
          onEdit={openEditChecklistTask}
          onDelete={deleteChecklistTask}
          onStatusChange={changeChecklistTaskStatus}
        />
      )}

      {open && (
        <AdminModal
          title={editing ? "Modifier le projet" : "Nouveau projet"}
          onClose={() => setOpen(false)}
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleSubmit} className="-m-1 space-y-5 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/50 p-4 sm:p-5">
            <div className="flex items-start gap-4 rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50/60 p-4 sm:p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm ring-1 ring-orange-100">
                <Briefcase className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{editing ? "Mettez à jour votre projet" : "Donnez un cadre clair au projet"}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">Commencez par l’objectif, puis ajoutez les informations de suivi utiles à l’équipe.</p>
              </div>
            </div>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <FileText className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-bold text-slate-800">Présentation</h3>
              </div>
              <div>
                <label htmlFor="mbootay-project-title" className="mb-1.5 block text-sm font-semibold text-slate-700">Nom du projet <span className="text-orange-600">*</span></label>
                <input id="mbootay-project-title" className="input !rounded-xl !py-3" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. Parcours d’accompagnement des entrepreneurs" required autoFocus />
                <p className="mt-1.5 text-xs text-slate-400">Choisissez un nom court que toute l’équipe reconnaîtra.</p>
              </div>
              <div>
                <label htmlFor="mbootay-project-description" className="mb-1.5 block text-sm font-semibold text-slate-700">Objectif et description</label>
                <textarea id="mbootay-project-description" className="input !rounded-xl" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Pourquoi ce projet existe-t-il ? Quels résultats souhaitez-vous obtenir ?" />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Target className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-bold text-slate-800">État d’avancement</h3>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {PROJECT_STATUSES.map((status) => {
                  const selected = form.status === status.key;
                  const descriptions = { non_demarre: "À lancer", en_cours: "Le travail avance", en_pause: "Suspendu temporairement", termine: "Objectif atteint" };
                  return (
                    <button key={status.key} type="button" aria-pressed={selected} onClick={() => setForm({ ...form, status: status.key })} className={`rounded-xl border p-3 text-left transition ${selected ? `${status.badge} border-current ring-2 ring-orange-100` : "border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/40"}`}>
                      <span className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${status.dot}`} />{status.label}{selected && <CheckCircle2 className="ml-auto h-4 w-4" />}</span>
                      <span className="mt-1 block pl-4 text-[11px] opacity-75">{descriptions[status.key]}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Users className="h-4 w-4 text-orange-500" />
                <h3 className="text-sm font-bold text-slate-800">Organisation</h3>
                <span className="text-xs text-slate-400">facultatif</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Responsable du projet">
                  <select className="select !rounded-xl !py-3" value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                    <option value="">Non assigné</option>
                    {team.map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                  </select>
                </FormField>
                <FormField label="Partenaire lié">
                  <select className="select !rounded-xl !py-3" value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })}>
                    <option value="">Aucun partenaire</option>
                    {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Dispositif">
                  <select className="select !rounded-xl !py-3" value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })}>
                    <option value="">Aucun dispositif</option>
                    {devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Date de début">
                  <input type="date" className="input !rounded-xl !py-3" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </FormField>
                <FormField label="Échéance">
                  <input type="date" className="input !rounded-xl !py-3" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </FormField>
              </div>
              <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <legend className="px-1 text-sm font-semibold text-slate-800">Équipe du projet</legend>
                <p className="mb-3 text-xs text-slate-500">Ajoutez les personnes qui doivent collaborer au projet. Les autres administrateurs sont disponibles ici aussi.</p>
                {team.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-600">Aucun membre d’équipe disponible.</p>
                ) : (
                  <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                    {team.map((member) => {
                      const checked = projectMemberIds.includes(Number(member.id));
                      return (
                        <label key={member.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setProjectMemberIds((selected) => checked
                              ? selected.filter((memberId) => memberId !== Number(member.id))
                              : [...selected, Number(member.id)])}
                            className="h-4 w-4 accent-orange-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">{member.full_name || member.email}</span>
                            <span className="block text-xs text-slate-500">{member.role === "admin" ? "Administrateur" : member.role || "Équipe ODC"}</span>
                          </span>
                          {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-600" />}
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="mt-3 text-xs font-medium text-slate-600">{projectMemberIds.length} personne{projectMemberIds.length === 1 ? "" : "s"} sélectionnée{projectMemberIds.length === 1 ? "" : "s"}</p>
              </fieldset>
            </section>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
              <p className="self-center text-xs text-slate-400">Les champs marqués * sont obligatoires.</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="btn-ghost rounded-xl border px-4">Annuler</button>
                <button type="submit" className="btn-primary rounded-xl px-5" disabled={saving}>
                  {saving ? "Enregistrement…" : editing ? "Enregistrer les changements" : "Créer le projet"}
                </button>
              </div>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
}

function WeeklyColumn({ title, range, weekStart, items, onAdd, onToggle, onEdit, onDelete, projects = [], isCurrentWeek = false }) {
  const [mainDraft, setMainDraft] = useState("");
  const [mainDate, setMainDate] = useState("");
  const [subDraft, setSubDraft] = useState("");
  const [subDate, setSubDate] = useState("");
  const [addingUnder, setAddingUnder] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const allItems = items.flatMap((item) => [item, ...(item.children || [])]);
  const doneCount = allItems.filter((item) => item.done).length;
  const activeItems = items.filter((item) => !item.done);
  const completedItems = items.filter((item) => item.done);

  const submitMain = async (event) => {
    event.preventDefault();
    if (!mainDraft.trim()) return;
    if (await onAdd(weekStart, mainDraft, null, mainDate)) {
      setMainDraft("");
      setMainDate("");
    }
  };

  const submitSub = async (event) => {
    event.preventDefault();
    if (!subDraft.trim() || !addingUnder) return;
    if (await onAdd(weekStart, subDraft, addingUnder, subDate)) {
      setSubDraft("");
      setSubDate("");
      setAddingUnder(null);
    }
  };

  return (
    <div className={`rounded-2xl border-2 p-4 shadow-sm transition sm:p-5 ${isCurrentWeek ? "border-orange-500 bg-orange-50 shadow-lg shadow-orange-100 ring-2 ring-orange-300" : "border-slate-300 bg-white"}`}>
      <div className={`mb-4 flex items-center gap-3 border-b-2 pb-3 ${isCurrentWeek ? "border-orange-200" : "border-slate-200"}`}>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${isCurrentWeek ? "bg-orange-600" : "bg-slate-900"}`}>
          <Clock3 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className={`text-base font-bold ${isCurrentWeek ? "text-orange-950" : "text-slate-950"}`}>{title}</h3>
          {isCurrentWeek && <span className="mt-1 inline-flex rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">Semaine actuelle</span>}
          <p className={`mt-1 text-xs font-medium ${isCurrentWeek ? "text-orange-800" : "text-slate-600"}`}>{range}</p>
        </div>
        <span className="ml-auto rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800">{doneCount} / {allItems.length} terminés</span>
      </div>
      <form onSubmit={submitMain} className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input className="input min-w-0 !border-slate-300 !bg-white text-sm !text-slate-950 placeholder:!text-slate-500" value={mainDraft} onChange={(event) => setMainDraft(event.target.value)} placeholder="Ajouter un grand point…" aria-label={`Ajouter un grand point ${title.toLowerCase()}`} />
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600">
          <CalendarDays className="h-4 w-4" />
          <span className="sr-only">Date du point ou de l’événement</span>
          <input type="date" className="min-w-0 bg-transparent py-2 text-sm text-slate-800 outline-none" value={mainDate} onChange={(event) => setMainDate(event.target.value)} aria-label="Date du grand point ou de l’événement" />
        </label>
        <button type="submit" className="btn-primary px-3" disabled={!mainDraft.trim()} aria-label="Ajouter le grand point"><Plus className="w-4 h-4" /></button>
      </form>
      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm font-medium text-slate-700">
          La liste est vide. Ajoutez un grand point pour commencer.
        </div>
      ) : (
        <div className="space-y-4">
          {[
            { label: "Suivi en cours", rows: activeItems, color: "text-orange-800" },
            { label: "Suivi terminé", rows: completedItems, color: "text-emerald-800" },
          ].map((group) => (
            <section key={group.label} className="space-y-2">
              <h4 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${group.color}`}>
                {group.label}<span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{group.rows.length}</span>
              </h4>
              {group.rows.length === 0 ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Aucun point dans cette partie.</p> : group.rows.map((item) => (
            <div key={item.id} className={`rounded-xl border-2 p-3.5 transition ${item.done ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => onToggle(item)} className="mt-0.5 rounded focus:outline-none focus:ring-2 focus:ring-orange-500" title={item.done ? "Marquer comme non terminé" : "Marquer comme terminé"}>
                  {item.done ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <Circle className="h-5 w-5 text-slate-500" />}
                </button>
                {editingId === item.id ? (
                  <div className="min-w-0 flex-1 space-y-2">
                    <input autoFocus className="input w-full !border-slate-300 !bg-white text-sm" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="Modifier le titre du grand point" />
                    <label className="flex items-center gap-2 text-xs text-slate-600">Date de l’événement <input type="date" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
                    <div className="flex gap-2"><button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={async () => { if (await onEdit(item, { title: editTitle, event_date: editDate || null })) setEditingId(null); }}>Enregistrer</button><button type="button" className="btn-ghost border px-3 py-1.5 text-xs" onClick={() => setEditingId(null)}>Annuler</button></div>
                  </div>
                ) : <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1"><p className={`min-w-0 flex-1 text-sm font-bold leading-5 ${item.done ? "text-slate-800 line-through decoration-2 decoration-slate-600" : "text-slate-950"}`}>{item.title}</p>{item.event_date && <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${isCurrentWeek ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"}`}><CalendarDays className="h-3.5 w-3.5" />{format(parseISO(String(item.event_date).slice(0, 10)), "d MMM yyyy", { locale: fr })}</span>}</div>}
                <button type="button" onClick={() => { setAddingUnder(addingUnder === item.id ? null : item.id); setSubDraft(""); }} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-orange-800 transition hover:bg-orange-50">
                  <Plus className="w-3.5 h-3.5" /> Sous-point
                </button>
                <button type="button" onClick={() => { setEditingId(item.id); setEditTitle(item.title); setEditDate(item.event_date ? String(item.event_date).slice(0, 10) : ""); }} className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:text-orange-700" title="Renommer ou changer la date"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => onDelete(item)} className="rounded-lg border border-slate-300 bg-white p-1.5 text-slate-600 hover:text-red-700" title="Supprimer ce point"><Trash2 className="h-4 w-4" /></button>
              </div>
              {(item.children || []).length > 0 && (
                <div className="ml-2 mt-3 space-y-1.5 border-l-[3px] border-slate-400 pl-3">
                  {item.children.map((child) => (
                    <div key={child.id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${child.done ? "bg-emerald-50" : "bg-white"}`}>
                      <button type="button" onClick={() => onToggle(child)} className="mt-0.5 rounded focus:outline-none focus:ring-2 focus:ring-orange-500" title={child.done ? "Marquer comme non terminé" : "Marquer comme terminé"}>
                        {child.done ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Circle className="h-4 w-4 text-slate-500" />}
                      </button>
                      {editingId === child.id ? (
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <input autoFocus className="input min-w-0 flex-1 !border-slate-300 !bg-white text-sm" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="Renommer le sous-point" />
                          <label className="flex items-center gap-2 text-[11px] text-slate-600">Date du sous-point <input type="date" className="rounded-lg border border-slate-300 bg-white px-2 py-1" value={editDate} onChange={(event) => setEditDate(event.target.value)} /></label>
                          <div className="flex gap-2"><button type="button" className="btn-primary px-2.5 py-1 text-xs" onClick={async () => { if (await onEdit(child, { title: editTitle, event_date: editDate || null })) setEditingId(null); }}>Enregistrer</button><button type="button" className="btn-ghost border px-2.5 py-1 text-xs" onClick={() => setEditingId(null)}>Annuler</button></div>
                        </div>
                      ) : (
                        <>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1"><p className={`min-w-0 flex-1 text-sm leading-5 ${child.done ? "font-medium text-slate-800 line-through decoration-2 decoration-slate-600" : "font-semibold text-slate-900"}`}>{child.title}</p>{child.event_date && <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${isCurrentWeek ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"}`}><CalendarDays className="h-3 w-3" />{format(parseISO(String(child.event_date).slice(0, 10)), "d MMM yyyy", { locale: fr })}</span>}</div>
                          <button type="button" onClick={() => { setEditingId(child.id); setEditTitle(child.title); setEditDate(child.event_date ? String(child.event_date).slice(0, 10) : ""); }} className="rounded p-1 text-slate-500 hover:text-orange-700" title="Modifier le sous-point"><Pencil className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => onDelete(child)} className="rounded p-1 text-slate-500 hover:text-red-700" title="Supprimer le sous-point"><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {addingUnder === item.id && (
                <form onSubmit={submitSub} className="ml-6 mt-2 flex flex-wrap gap-2">
                  <input autoFocus className="input min-w-0 flex-1 !border-slate-300 !bg-white !text-slate-950 placeholder:!text-slate-500 text-sm" value={subDraft} onChange={(event) => setSubDraft(event.target.value)} placeholder="Nom du sous-point…" aria-label="Nom du sous-point" />
                  <input type="date" className="rounded-lg border border-slate-300 bg-white px-2 text-sm" value={subDate} onChange={(event) => setSubDate(event.target.value)} aria-label="Date du sous-point" />
                  <button type="submit" className="rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!subDraft.trim()}>Ajouter</button>
                </form>
              )}
            </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {projects.length > 0 && <div className={`mt-4 rounded-xl border p-3 ${isCurrentWeek ? "border-orange-200 bg-white/80" : "border-slate-200 bg-slate-50"}`}>
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><Briefcase className="h-3.5 w-3.5 text-orange-600" />Projets prévus cette semaine</p>
        <div className="space-y-1.5">{projects.map((project) => <Link key={project.id} to={`/mbootay/${project.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-orange-50 hover:text-orange-800"><span className="truncate">{project.title}</span><span className="shrink-0 text-[11px] font-medium text-slate-500">{projectStatusMeta(project.status).label}</span></Link>)}</div>
      </div>}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, tone = "slate", hint }) {
  const tones = {
    orange: "bg-orange-100 text-orange-700 ring-orange-200",
    amber: "bg-amber-100 text-amber-700 ring-amber-200",
    green: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    slate: "bg-sky-100 text-sky-700 ring-sky-200",
  };
  const surfaces = {
    orange: "border-orange-200 bg-gradient-to-br from-orange-50 to-white",
    amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white",
    green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
    slate: "border-sky-200 bg-gradient-to-br from-sky-50 to-white",
  };
  return (
    <div className={`group rounded-xl border p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-3.5 ${surfaces[tone] || surfaces.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${tones[tone] || tones.slate}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-600">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900">{value}</p>
        <p className="pb-0.5 text-right text-[10px] text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-slate-700">{label}</p>
      {children}
    </div>
  );
}

function StandaloneChecklist({ tasks, team, formOpen, editing, form, setForm, saving, onOpenForm, onCloseForm, onSubmit, onEdit, onDelete, onStatusChange }) {
  const [view, setView] = useState("tasks");
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const formPanelRef = useRef(null);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  useEffect(() => {
    if (formOpen) formPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [formOpen]);
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarMonth), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [calendarMonth]);
  const columns = CHECKLIST_STATUSES.map((status) => ({
    ...status,
    panel: { a_faire: "bg-slate-100", en_cours: "bg-orange-50", en_pause: "bg-amber-50", termine: "bg-emerald-50", annule: "bg-rose-50" }[status.key],
    header: { a_faire: "bg-slate-700", en_cours: "bg-orange-600", en_pause: "bg-amber-600", termine: "bg-emerald-700", annule: "bg-rose-700" }[status.key],
    border: { a_faire: "border-slate-300", en_cours: "border-orange-200", en_pause: "border-amber-200", termine: "border-emerald-200", annule: "border-rose-200" }[status.key],
  }));
  const tasksByDay = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      if (!task.due_date) return;
      const key = String(task.due_date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(task);
    });
    return map;
  }, [tasks]);
  const statusColor = (key) => ({
    a_faire: "border-slate-300 bg-white",
    en_cours: "border-orange-300 bg-orange-50",
    en_pause: "border-amber-300 bg-amber-50",
    termine: "border-emerald-300 bg-emerald-50",
    annule: "border-rose-300 bg-rose-50",
  }[key] || "border-slate-300 bg-white");
  const taskCard = (task) => {
    const status = CHECKLIST_STATUSES.find((item) => item.key === task.status) || CHECKLIST_STATUSES[0];
    const due = task.due_date ? parseISO(String(task.due_date).slice(0, 10)) : null;
    const late = due && due < today && !["termine", "annule"].includes(task.status);
    return (
      <article key={task.id} className={`group rounded-xl border-2 p-3 shadow-sm transition hover:border-orange-400 hover:shadow-md ${statusColor(task.status)}`}>
        <div className="flex items-start gap-2">
          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-bold leading-5 ${task.status === "termine" ? "text-emerald-900 line-through decoration-2" : task.status === "annule" ? "text-slate-600 line-through" : "text-slate-950"}`}>{task.title}</p>
            {task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{task.description}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => onEdit(task)} title="Modifier" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/80 hover:text-orange-700"><Pencil className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => onDelete(task)} title="Supprimer" className="rounded-lg p-1.5 text-slate-500 hover:bg-white/80 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-5">
          <select aria-label={`État de ${task.title}`} value={task.status} onChange={(event) => onStatusChange(task, event.target.value)} className={`max-w-full rounded-full border px-2.5 py-1 text-[11px] font-bold focus:outline-none focus:ring-2 focus:ring-orange-200 ${status.chip}`}>
            {CHECKLIST_STATUSES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          {task.assigned_name && <span className="max-w-[130px] truncate rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-slate-700">{task.assigned_name}</span>}
          {due && <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${late ? "bg-rose-100 text-rose-800" : "bg-white/80 text-slate-700"}`}>{format(due, "d MMM", { locale: fr })}{late ? " · Retard" : ""}</span>}
        </div>
      </article>
    );
  };
  const todayKey = dateKey(today);
  const soonKey = dateKey(addDays(today, 7));
  const overdueTasks = tasks.filter((task) => task.due_date && String(task.due_date).slice(0, 10) < todayKey && !["termine", "annule"].includes(task.status));
  const overdueIds = new Set(overdueTasks.map((task) => task.id));
  const soonTasks = tasks.filter((task) => {
    const due = task.due_date ? String(task.due_date).slice(0, 10) : "";
    return due >= todayKey && due <= soonKey && !overdueIds.has(task.id) && !["termine", "annule"].includes(task.status);
  });
  const prioritizedIds = new Set([...overdueTasks, ...soonTasks].map((task) => task.id));
  const inProgressTasks = tasks.filter((task) => task.status === "en_cours" && !prioritizedIds.has(task.id));
  const highlightedIds = new Set([...prioritizedIds, ...inProgressTasks.map((task) => task.id)]);
  const priorityGroups = [
    { title: "En retard", hint: "À traiter rapidement", tasks: overdueTasks, style: "border-rose-200 bg-rose-50/70", heading: "text-rose-900", badge: "bg-rose-200 text-rose-900", icon: AlertTriangle },
    { title: "À échéance bientôt", hint: "Dans les 7 prochains jours", tasks: soonTasks, style: "border-orange-200 bg-orange-50/70", heading: "text-orange-900", badge: "bg-orange-200 text-orange-900", icon: CalendarDays },
    { title: "En cours", hint: "Déjà commencées", tasks: inProgressTasks, style: "border-amber-200 bg-amber-50/70", heading: "text-amber-900", badge: "bg-amber-200 text-amber-900", icon: Activity },
    { title: "Autres tâches", hint: "À faire, en pause ou terminées", tasks: tasks.filter((task) => !highlightedIds.has(task.id)), style: "border-slate-200 bg-slate-50/70", heading: "text-slate-800", badge: "bg-slate-200 text-slate-800", icon: ListTodo },
  ];

  return (
    <section className="space-y-4">
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-300 bg-white/95 p-2 shadow-md backdrop-blur">
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
          <ChecklistViewToggle active={view === "tasks"} onClick={() => setView("tasks")} icon={ListTodo}>Tâches</ChecklistViewToggle>
          <ChecklistViewToggle active={view === "calendar"} onClick={() => setView("calendar")} icon={CalendarDays}>Calendrier</ChecklistViewToggle>
          <ChecklistViewToggle active={view === "priorities"} onClick={() => setView("priorities")} icon={Target}>Priorités</ChecklistViewToggle>
        </div>
      </div>

      {formOpen && (
        <form ref={formPanelRef} onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/70 to-white p-4 shadow-sm sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><ListTodo className="h-4 w-4 text-orange-600" />{editing ? "Modifier la tâche" : "Nouvelle tâche"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Intitulé <span className="text-orange-600">*</span></span><input required autoFocus className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex. Préparer la réunion" /></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Description</span><textarea className="input" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Précisions utiles…" /></label>
            <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Responsable</span><select className="select" value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}><option value="">Non affectée</option>{team.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.email}</option>)}</select></label>
            <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Échéance</span><input type="date" className="input" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></label>
          </div>
          <fieldset><legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">État de la tâche</legend><div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">{CHECKLIST_STATUSES.map((status) => <button key={status.key} type="button" aria-pressed={form.status === status.key} onClick={() => setForm({ ...form, status: status.key })} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${form.status === status.key ? status.selected : `${status.chip} hover:brightness-95`}`}><span className={`h-2 w-2 rounded-full ${status.dot} ${form.status === status.key ? "ring-2 ring-white/60" : ""}`} />{status.label}</button>)}</div></fieldset>
          <div className="flex justify-end gap-2 border-t border-orange-100 pt-3"><button type="button" onClick={onCloseForm} className="btn-ghost border border-slate-200 bg-white">Annuler</button><button type="submit" disabled={saving || !form.title.trim()} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter à mes tâches"}</button></div>
        </form>
      )}

      {view === "tasks" ? (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {columns.map((column) => {
            const columnTasks = tasks.filter((task) => (task.status || "a_faire") === column.key);
            return <section key={column.key} className={`min-h-[240px] w-[280px] max-w-[82vw] shrink-0 snap-start rounded-2xl border-2 p-3.5 ${column.border} ${column.panel}`}>
              <div className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-white shadow-sm ${column.header}`}><span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white/25 ${column.dot}`} /><h3 className="text-sm font-bold">{column.label}</h3><span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">{columnTasks.length}</span><button type="button" onClick={() => onOpenForm(column.key)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25" aria-label={`Ajouter une tâche ${column.label}`}><Plus className="h-4 w-4" /></button></div>
              <div className="space-y-2">{columnTasks.map(taskCard)}</div>
              {columnTasks.length === 0 && <p className="py-4 text-center text-xs font-medium text-slate-500">Aucune tâche</p>}
            </section>;
          })}
        </div>
      ) : view === "calendar" && tasks.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/30 p-9 text-center"><ClipboardCheck className="mx-auto h-9 w-9 text-orange-300" /><p className="mt-3 font-bold text-slate-800">Aucune tâche pour le moment</p><p className="mt-1 text-sm text-slate-600">Ajoute une tâche depuis le bouton + de la colonne voulue dans la vue Tâches.</p></div>
      ) : view === "priorities" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {priorityGroups.map((group) => {
            const Icon = group.icon;
            return <section key={group.title} className={`rounded-2xl border p-4 shadow-sm ${group.style}`}>
              <div className="mb-3 flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80"><Icon className={`h-4 w-4 ${group.heading}`} /></span><div className="min-w-0 flex-1"><h3 className={`text-sm font-extrabold ${group.heading}`}>{group.title}</h3><p className="text-[11px] text-slate-600">{group.hint}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${group.badge}`}>{group.tasks.length}</span></div>
              <div className="space-y-2">{group.tasks.length ? group.tasks.map(taskCard) : <p className="rounded-xl border border-dashed border-slate-300/80 bg-white/60 px-3 py-4 text-center text-xs font-medium text-slate-500">Aucune tâche dans cette catégorie.</p>}</div>
            </section>;
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-bold capitalize text-slate-950">{format(calendarMonth, "MMMM yyyy", { locale: fr })}</h3><div className="flex items-center gap-2"><button type="button" onClick={() => setCalendarMonth(startOfMonth(new Date()))} className="btn-ghost border px-3 py-1.5 text-xs">Aujourd’hui</button><button type="button" onClick={() => setCalendarMonth((month) => subMonths(month, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-orange-50" aria-label="Mois précédent"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setCalendarMonth((month) => addMonths(month, 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-orange-50" aria-label="Mois suivant"><ChevronRight className="h-4 w-4" /></button></div></div>
            <div className="mb-1 grid grid-cols-7 gap-px text-center text-xs font-bold uppercase tracking-wide text-slate-700">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="py-1">{day}</div>)}</div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border-2 border-slate-300 bg-slate-300">{days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayTasks = tasksByDay.get(key) || [];
              return <div key={key} className={`min-h-[92px] p-1.5 ${isSameMonth(day, calendarMonth) ? "bg-white" : "bg-slate-100"}`}><div className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isSameDay(day, new Date()) ? "bg-orange-500 font-bold text-white" : isSameMonth(day, calendarMonth) ? "font-semibold text-slate-800" : "text-slate-400"}`}>{format(day, "d")}</div><div className="space-y-1">{dayTasks.slice(0, 3).map((task) => <button key={task.id} type="button" onClick={() => onEdit(task)} title={task.title} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-bold ${({ a_faire: "bg-slate-100 text-slate-800 hover:bg-slate-200", en_cours: "bg-orange-100 text-orange-900 hover:bg-orange-200", en_pause: "bg-amber-100 text-amber-900 hover:bg-amber-200", termine: "bg-emerald-100 text-emerald-900 line-through", annule: "bg-rose-100 text-rose-900 line-through" })[task.status] || "bg-slate-100 text-slate-800"}`}>{task.title}</button>)}{dayTasks.length > 3 && <p className="px-1 text-[10px] font-semibold text-slate-600">+{dayTasks.length - 3} autre{dayTasks.length - 3 > 1 ? "s" : ""}</p>}</div></div>;
            })}</div>
          </div>
          {tasks.some((task) => !task.due_date) && <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="mb-2 text-sm font-bold text-slate-900">Sans échéance</h3><div className="flex flex-wrap gap-2">{tasks.filter((task) => !task.due_date).map((task) => <button key={task.id} type="button" onClick={() => onEdit(task)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${statusColor(task.status)} hover:border-orange-400`}>{task.title}</button>)}</div></div>}
        </div>
      )}
    </section>
  );
}

function ChecklistViewToggle({ active, onClick, icon: Icon, children }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${active ? "border-orange-200 bg-orange-50 text-orange-700" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"}`}><Icon className="h-4 w-4" />{children}</button>;
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

function ProjectCard({ project, index, currentUserId, onEdit, onDelete }) {
  const meta = projectStatusMeta(project.status);
  const members = Array.isArray(project.members) ? project.members : [];
  const total = Number(project.tasks_total || 0);
  const done = Number(project.tasks_done || 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 ${project.status === "en_cours" ? "border-orange-200 bg-gradient-to-br from-orange-50/80 via-white to-amber-50/60" : project.status === "termine" ? "border-emerald-100 bg-gradient-to-br from-emerald-50/40 to-white" : "border-slate-200 bg-white"}`}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className={`absolute inset-x-0 top-0 h-1 ${project.status === "termine" ? "bg-emerald-400" : project.status === "en_pause" ? "bg-amber-400" : project.status === "non_demarre" ? "bg-slate-300" : "bg-orange-500"}`} />
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
            <Briefcase className="h-3.5 w-3.5" /> Projet d’équipe
          </div>
          <Link
            to={`/mbootay/${project.id}`}
            className="block truncate text-lg font-bold tracking-tight text-slate-900 transition hover:text-orange-600"
          >
            {project.title}
          </Link>
          <span className={`mt-2 inline-flex items-center rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold ${meta.badge}`}>
            <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 opacity-70 transition group-hover:opacity-100">
          <Link
            to={`/mbootay/${project.id}`}
            title="Ouvrir le projet"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
          >
            <ArrowUpRight className="w-4 h-4" />
          </Link>
          <button onClick={onEdit} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600" title="Modifier">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600" title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 min-h-[4rem] text-sm leading-6 text-slate-700">
        {project.description || "Ajoutez une description pour partager l’objectif de ce projet avec l’équipe."}
      </p>

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
          <span className="font-semibold">Avancement</span>
          <span className="font-bold text-slate-800">{done}/{total} tâches · {pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ${project.status === "termine" ? "bg-emerald-500" : "bg-gradient-to-r from-orange-400 to-orange-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid auto-rows-fr grid-cols-2 gap-2">
        <ProjectDetail icon={Users} label="Responsable" value={project.owner_name || "À définir"} />
        <ProjectDetail
          icon={CalendarDays}
          label="Période"
          value={project.start_date || project.due_date
            ? `${project.start_date ? format(parseISO(String(project.start_date).slice(0, 10)), "d MMM yy", { locale: fr }) : "Début à définir"} → ${project.due_date ? format(parseISO(String(project.due_date).slice(0, 10)), "d MMM yy", { locale: fr }) : "Sans échéance"}`
            : "À planifier"}
        />
      </div>

      <div className="mt-3 rounded-xl bg-orange-50/70 px-3.5 py-3 ring-1 ring-orange-100/80">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Users className="h-3.5 w-3.5 text-orange-600" /> Équipe du projet</span>
          <span className="text-[11px] font-medium text-slate-500">{members.length} membre{members.length === 1 ? "" : "s"}</span>
        </div>
        {members.length ? (
          <div className="flex flex-wrap gap-1.5">
            {members.map((member) => {
              const name = member.full_name || member.email || "Membre";
              const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
              const isCurrentUser = Number(member.id) === Number(currentUserId);
              return (
                <span key={member.id} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] font-semibold ${isCurrentUser ? "border-orange-200 bg-white text-orange-800" : "border-white bg-white/80 text-slate-700"}`} title={name}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${isCurrentUser ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600"}`}>{initials}</span>
                  <span className="truncate">{name}{isCurrentUser ? " · Moi" : ""}</span>
                </span>
              );
            })}
          </div>
        ) : <p className="text-xs text-slate-500">Aucun membre ajouté</p>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
        <Link to={`/mbootay/${project.id}`} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
          Ouvrir le projet <ArrowRight className="h-4 w-4" />
        </Link>
        <span className="hidden text-xs font-medium text-slate-600 sm:inline">Détails & tâches</span>
      </div>
    </article>
  );
}

function ProjectDetail({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" /> {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-800" title={value}>{value}</p>
    </div>
  );
}
