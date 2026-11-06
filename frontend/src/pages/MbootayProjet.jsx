import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  Plus,
  ListTodo,
  CalendarDays,
  Users,
  Pencil,
  Trash2,
  Building2,
  Layers,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  GripVertical,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";
import AdminModal from "../components/admin/AdminModal";
import { projectStatusMeta } from "./Mbootay";
import { useToast, useConfirm, Button } from "../components/ui";

const TASK_COLUMNS = [
  { key: "a_faire", label: "À faire", dot: "bg-slate-500", panel: "bg-slate-100", border: "border-slate-300", header: "bg-slate-700", add: "border-slate-400 text-slate-700 hover:border-slate-600 hover:text-slate-900" },
  { key: "en_cours", label: "En cours", dot: "bg-orange-500", panel: "bg-orange-50", border: "border-orange-200", header: "bg-orange-600", add: "border-orange-300 text-orange-800 hover:border-orange-500 hover:text-orange-900" },
  { key: "en_pause", label: "En pause", dot: "bg-amber-500", panel: "bg-amber-50", border: "border-amber-200", header: "bg-amber-600", add: "border-amber-300 text-amber-800 hover:border-amber-500 hover:text-amber-900" },
  { key: "termine", label: "Terminé", dot: "bg-emerald-500", panel: "bg-emerald-50", border: "border-emerald-200", header: "bg-emerald-700", add: "border-emerald-300 text-emerald-800 hover:border-emerald-500 hover:text-emerald-900" },
  { key: "annule", label: "Annulé", dot: "bg-rose-500", panel: "bg-rose-50", border: "border-rose-200", header: "bg-rose-700", add: "border-rose-300 text-rose-800 hover:border-rose-500 hover:text-rose-900" },
];

const TASK_PRIORITIES = [
  { key: "basse", label: "Basse", badge: "bg-slate-100 text-slate-600" },
  { key: "normale", label: "Normale", badge: "bg-sky-50 text-sky-700" },
  { key: "haute", label: "Haute", badge: "bg-red-50 text-red-700" },
];

const EMPTY_TASK = {
  title: "",
  description: "",
  status: "a_faire",
  priority: "normale",
  assigned_to: "",
  due_date: "",
};

function priorityMeta(key) {
  return TASK_PRIORITIES.find((p) => p.key === key) || TASK_PRIORITIES[1];
}

function toDateOnly(value) {
  return value ? parseISO(String(value).slice(0, 10)) : null;
}

export default function MbootayProjet() {
  const { id } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const [view, setView] = useState("kanban");
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [savingTask, setSavingTask] = useState(false);

  const [membersOpen, setMembersOpen] = useState(false);
  const [memberSelection, setMemberSelection] = useState([]);
  const [savingMembers, setSavingMembers] = useState(false);

  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));

  const fetchAll = useCallback(async () => {
    setError("");
    try {
      const projectRes = await api.get(`/mbootay/projects/${id}`);
      setProject(projectRes.data);
      setNotFound(false);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      console.error("Erreur chargement projet", err);
      setError("Impossible de charger ce projet.");
      setLoading(false);
      return;
    }

    const [tasksRes, membersRes, teamRes] = await Promise.allSettled([
      api.get(`/mbootay/projects/${id}/tasks`),
      api.get(`/mbootay/projects/${id}/members`),
      api.get("/mbootay/team"),
    ]);
    if (tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data)) {
      setTasks(tasksRes.value.data);
    }
    if (membersRes.status === "fulfilled" && Array.isArray(membersRes.value.data)) {
      setMembers(membersRes.value.data);
    }
    if (teamRes.status === "fulfilled" && Array.isArray(teamRes.value.data)) {
      setTeam(teamRes.value.data);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /* ===== TÂCHES ===== */
  const openCreateTask = (status = "a_faire") => {
    setEditingTask(null);
    setTaskForm({ ...EMPTY_TASK, status });
    setTaskModalOpen(true);
  };

  const openEditTask = (task) => {
    setEditingTask(task);
    setTaskForm({
      title: task.title || "",
      description: task.description || "",
      status: task.status || "a_faire",
      priority: task.priority || "normale",
      assigned_to: task.assigned_to ? String(task.assigned_to) : "",
      due_date: task.due_date ? String(task.due_date).slice(0, 10) : "",
    });
    setTaskModalOpen(true);
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    setSavingTask(true);
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description || null,
        status: taskForm.status,
        priority: taskForm.priority,
        assigned_to: taskForm.assigned_to ? Number(taskForm.assigned_to) : null,
        due_date: taskForm.due_date || null,
      };
      if (editingTask) {
        await api.put(`/mbootay/tasks/${editingTask.id}`, payload);
      } else {
        await api.post(`/mbootay/projects/${id}/tasks`, payload);
      }
      setTaskModalOpen(false);
      setEditingTask(null);
      toast.success(editingTask ? "Tâche mise à jour." : "Tâche créée.");
      await fetchAll();
    } catch (err) {
      console.error("Erreur enregistrement tâche", err);
      toast.error(err.response?.data?.error || "Erreur lors de l'enregistrement de la tâche.");
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (task) => {
    const ok = await confirm({
      title: `Supprimer « ${task.title} » ?`,
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/mbootay/tasks/${task.id}`);
      toast.success("Tâche supprimée.");
      await fetchAll();
    } catch (err) {
      console.error("Erreur suppression tâche", err);
      toast.error("Suppression impossible.");
    }
  };

  /* Déplacement Kanban : optimiste, avec retour arrière si le serveur refuse. */
  const handleMoveTask = async (taskId, status) => {
    const task = tasks.find((t) => String(t.id) === String(taskId));
    if (!task || task.status === status) return;

    const previous = tasks;
    setTasks((prev) =>
      prev.map((t) => (String(t.id) === String(taskId) ? { ...t, status } : t))
    );
    try {
      await api.patch(`/mbootay/tasks/${taskId}/status`, { status });
    } catch (err) {
      console.error("Erreur déplacement tâche", err);
      setTasks(previous);
      toast.error("Le déplacement n'a pas pu être enregistré.");
    }
  };

  /* ===== MEMBRES ===== */
  const openMembers = () => {
    setMemberSelection(members.map((m) => m.id));
    setMembersOpen(true);
  };

  const toggleMember = (userId) => {
    setMemberSelection((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]
    );
  };

  const handleSaveMembers = async () => {
    setSavingMembers(true);
    try {
      await api.put(`/mbootay/projects/${id}/members`, { user_ids: memberSelection });
      setMembersOpen(false);
      toast.success("Membres du projet mis à jour.");
      await fetchAll();
    } catch (err) {
      console.error("Erreur enregistrement membres", err);
      toast.error("Enregistrement impossible.");
    } finally {
      setSavingMembers(false);
    }
  };

  const progress = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "termine").length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  if (loading) {
    return <div className="card p-8 text-center text-slate-500">Chargement du projet...</div>;
  }

  if (notFound) {
    return (
      <div className="card p-10 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-slate-300 mx-auto" />
        <p className="text-slate-700 font-medium">Projet introuvable</p>
        <Link to="/mbootay" className="btn-ghost border inline-flex">
          <ArrowLeft className="w-4 h-4" />
          Retour à Mbootay
        </Link>
      </div>
    );
  }

  const meta = projectStatusMeta(project?.status);

  return (
    <div className="space-y-6">
      {error && (
        <div className="card p-4 flex items-center gap-3 text-sm text-red-700 bg-red-50/70 border-red-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* En-tête */}
      <div className="relative isolate w-full space-y-1.5 overflow-hidden rounded-2xl bg-slate-950 p-2.5 text-white shadow-lg shadow-slate-900/10 sm:space-y-2 sm:p-3">
        <div className="absolute -right-10 -top-16 -z-10 h-60 w-60 rounded-full bg-orange-500/25 blur-3xl" />
        <Link
          to="/mbootay"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 transition hover:text-orange-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Mbootay
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="min-w-0 flex-1 text-xl font-bold tracking-tight text-white sm:text-2xl">{project?.title}</h1>
              <button onClick={() => openCreateTask()} className="btn-primary shrink-0 px-3 py-2 text-sm">
                <Plus className="h-4 w-4" /> Nouvelle tâche
              </button>
            </div>
            {project?.description && (
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300 sm:text-sm">{project.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span className={`badge border-transparent ${meta.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${meta.dot}`} />
                {meta.label}
              </span>
              {project?.owner_name && (
                <span className="badge border-white/20 bg-white/10 text-slate-100">
                  <Users className="w-3 h-3 mr-1.5" />
                  {project.owner_name}
                </span>
              )}
              {project?.partner_name && (
                <span className="badge border-white/20 bg-white/10 text-slate-100">
                  <Building2 className="w-3 h-3 mr-1.5" />
                  Partenaire · {project.partner_name}
                </span>
              )}
              {project?.device_name && (
                <span className="badge border-white/20 bg-white/10 text-slate-100">
                  <Layers className="w-3 h-3 mr-1.5" />
                  Dispositif · {project.device_name}
                </span>
              )}
              {project?.due_date && (
                <span className="badge border-white/20 bg-white/10 text-slate-100">
                  <CalendarDays className="w-3 h-3 mr-1.5" />
                  Échéance {format(toDateOnly(project.due_date), "d MMM yyyy", { locale: fr })}
                </span>
              )}
            </div>
          </div>

        </div>

        {members.length > 0 && (
          <section className="w-full rounded-xl border border-orange-200 bg-white p-2 shadow-sm" aria-label="Membres assignés au projet">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <h2 className="flex items-center gap-1.5 text-xs font-bold text-slate-900"><Users className="h-3.5 w-3.5 text-orange-600" />Équipe assignée</h2>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-900">{members.length}</span>
              <button type="button" onClick={openMembers} className="rounded-md border border-slate-200 p-1 text-slate-600 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700" aria-label="Modifier l’équipe assignée" title="Modifier l’équipe"><Pencil className="h-3 w-3" /></button>
            </div>
            <div className="flex flex-wrap gap-1.5">
            {members.map((member) => {
              const name = member.full_name || member.email || "Membre";
              const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
              const isCurrentUser = Number(member.id) === Number(user?.id);
              return (
                <div key={member.id} className={`flex min-w-0 flex-1 basis-[200px] items-center gap-1.5 rounded-full border px-2 py-1 ${isCurrentUser ? "border-orange-500 bg-orange-50 text-orange-950 ring-1 ring-orange-200" : "border-slate-200 bg-slate-50 text-slate-900"}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold ${isCurrentUser ? "bg-orange-600 text-white" : "bg-slate-700 text-white"}`}>{initials}</span>
                  <span className="max-w-[150px] truncate text-xs font-bold">{name}</span>{isCurrentUser && <span className="rounded-full bg-orange-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">Moi</span>}
                </div>
              );
            })}
            </div>
          </section>
        )}

        <div>
          <div className="mb-0.5 flex items-center justify-between text-[10px] text-slate-300">
            <span className="font-semibold">Avancement</span>
            <span className="font-semibold text-white">
              {progress.done}/{progress.total} tâches · {progress.pct}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bascule de vue */}
      <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-300 bg-white/95 p-2 shadow-md backdrop-blur">
        <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
        <ViewToggle active={view === "kanban"} onClick={() => setView("kanban")} icon={ListTodo}>
            Tâches
          </ViewToggle>
          <ViewToggle active={view === "calendrier"} onClick={() => setView("calendrier")} icon={CalendarDays}>
            Calendrier
          </ViewToggle>
        </div>
        {view === "calendrier" && <button onClick={() => openCreateTask()} className="btn-primary min-h-10 px-4">
          <Plus className="h-4 w-4" /> Ajouter une tâche
        </button>}
      </div>

      {view === "kanban" ? (
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
          {TASK_COLUMNS.map((column) => {
            const columnTasks = tasks.filter((t) => (t.status || "a_faire") === column.key);
            return (
              <div
                key={column.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverColumn(column.key);
                }}
                onDragLeave={() => setDragOverColumn((c) => (c === column.key ? null : c))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedId != null) handleMoveTask(draggedId, column.key);
                  setDraggedId(null);
                  setDragOverColumn(null);
                }}
                className={`min-h-[240px] w-[280px] max-w-[82vw] shrink-0 snap-start rounded-2xl border-2 p-3.5 transition ${column.border} ${column.panel} ${
                  dragOverColumn === column.key
                    ? "border-orange-500 bg-orange-100"
                    : ""
                }`}
              >
                <div className={`mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-white shadow-sm ${column.header}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ring-2 ring-white/25 ${column.dot}`} />
                  <p className="text-sm font-bold">{column.label}</p>
                  <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold text-white">{columnTasks.length}</span>
                  <button type="button" onClick={() => openCreateTask(column.key)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25" aria-label={`Ajouter une tâche ${column.label.toLowerCase()}`} title={`Ajouter dans « ${column.label} »`}><Plus className="h-4 w-4" /></button>
                </div>

                <div className="space-y-2">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isMine={Number(task.assigned_to) === Number(user?.id)}
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverColumn(null);
                      }}
                      dragging={String(draggedId) === String(task.id)}
                      onEdit={() => openEditTask(task)}
                      onDelete={() => handleDeleteTask(task)}
                      onStatusChange={(status) => handleMoveTask(task.id, status)}
                    />
                  ))}
                </div>

              </div>
            );
          })}
        </div>
      ) : (
        <TaskCalendar
          tasks={tasks}
          month={calendarMonth}
          onPrev={() => setCalendarMonth((m) => subMonths(m, 1))}
          onNext={() => setCalendarMonth((m) => addMonths(m, 1))}
          onToday={() => setCalendarMonth(startOfMonth(new Date()))}
          onSelectTask={openEditTask}
        />
      )}

      {/* Modale tâche */}
      {taskModalOpen && (
        <AdminModal
          title={editingTask ? "Modifier la tâche" : "Nouvelle tâche"}
          onClose={() => setTaskModalOpen(false)}
        >
          <form onSubmit={handleTaskSubmit} className="space-y-4 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/60 to-white p-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Titre *</label>
              <input
                className="input"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Préparer le support de formation"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                className="input"
                rows={3}
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
              />
            </div>

            <fieldset className="min-w-0 space-y-1.5">
              <legend className="mb-1 block text-sm font-medium text-slate-700">Statut</legend>
              <div role="radiogroup" aria-label="Statut de la tâche" className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                {TASK_COLUMNS.map((column) => {
                  const selected = taskForm.status === column.key;
                  const selectedTone = {
                    a_faire: "border-slate-700 bg-slate-700 text-white",
                    en_cours: "border-orange-600 bg-orange-600 text-white",
                    en_pause: "border-amber-600 bg-amber-500 text-white",
                    termine: "border-emerald-700 bg-emerald-700 text-white",
                    annule: "border-rose-700 bg-rose-700 text-white",
                  }[column.key];
                  return <button key={column.key} type="button" role="radio" aria-checked={selected} onClick={() => setTaskForm({ ...taskForm, status: column.key })} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${selected ? selectedTone : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}><span className={`h-2 w-2 rounded-full ${column.dot} ${selected ? "ring-2 ring-white/60" : ""}`} />{column.label}</button>;
                })}
              </div>
            </fieldset>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priorité</label>
              <select
                className="select"
                value={taskForm.priority}
                onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assignée à</label>
                <select
                  className="select"
                  value={taskForm.assigned_to}
                  onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                >
                  <option value="">Non assignée</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Échéance</label>
                <input
                  type="date"
                  className="input"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setTaskModalOpen(false)} className="btn-ghost border">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={savingTask}>
                {savingTask ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {/* Modale membres */}
      {membersOpen && (
        <AdminModal title="Membres du projet" onClose={() => setMembersOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Sélectionnez les membres de l'équipe ODC qui participent à ce projet.
            </p>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {team.length === 0 && (
                <p className="px-4 py-3 text-sm text-slate-500">
                  Aucun membre disponible — accordez l'accès Mbootay depuis la page Utilisateurs.
                </p>
              )}
              {team.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={memberSelection.includes(u.id)}
                    onChange={() => toggleMember(u.id)}
                    className="w-4 h-4 accent-orange-500"
                  />
                  <span className="text-sm text-slate-700 flex-1">{u.full_name || u.email}</span>
                  <span className="text-xs text-slate-500">{u.role}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setMembersOpen(false)} className="btn-ghost border">
                Annuler
              </button>
              <button onClick={handleSaveMembers} className="btn-primary" disabled={savingMembers}>
                {savingMembers ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </AdminModal>
      )}
    </div>
  );
}

function ViewToggle({ active, onClick, icon: Icon, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
        active
          ? "border-orange-200 bg-orange-50 text-orange-700"
          : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

function TaskCard({ task, isMine = false, onDragStart, onDragEnd, dragging, onEdit, onDelete, onStatusChange }) {
  const prio = priorityMeta(task.priority);
  const due = toDateOnly(task.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const late = due && due < today && !["termine", "annule"].includes(task.status);
  const isCompleted = task.status === "termine";
  const isCancelled = task.status === "annule";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group cursor-grab rounded-xl border-2 p-3.5 shadow-sm transition hover:border-orange-400 hover:shadow-md active:cursor-grabbing ${
        dragging ? "opacity-40" : isCompleted ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200" : isMine ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200" : isCancelled ? "border-rose-300 bg-rose-50" : "border-slate-300 bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
        <p
          className={`flex-1 text-sm font-semibold leading-5 ${
            isCancelled ? "text-slate-700 line-through decoration-2 decoration-slate-600" : isCompleted ? "text-slate-950" : "text-slate-950"
          }`}
        >
          {task.title}
        </p>
        <div className="flex flex-shrink-0 items-center gap-1.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-orange-50 hover:text-orange-700" title="Modifier">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-700" title="Supprimer">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pl-5">
        <select
          value={task.status || "a_faire"}
          onChange={(event) => onStatusChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onDragStart={(event) => event.preventDefault()}
          aria-label={`Statut de la tâche ${task.title}`}
          className="max-w-full rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-orange-400"
        >
          {TASK_COLUMNS.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
        </select>
        {isMine && <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-sm"><Users className="h-3 w-3" />À moi</span>}
        <span className={`badge border-transparent ${prio.badge}`}>{prio.label}</span>
        {due && (
          <span
            className={`badge ${
              late
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-slate-200 border-slate-300 text-slate-800"
            }`}
          >
            {format(due, "d MMM", { locale: fr })}
          </span>
        )}
        {task.assigned_name && (
          <span className="max-w-[110px] truncate text-xs font-medium text-slate-700">{task.assigned_name}</span>
        )}
      </div>
    </div>
  );
}

function TaskCalendar({ tasks, month, onPrev, onNext, onToday, onSelectTask }) {
  const days = useMemo(() => {
    // Toujours 6 semaines : la grille garde la même hauteur d'un mois à l'autre.
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month]);

  const tasksByDay = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      if (!t.due_date) return;
      const key = String(t.due_date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    });
    return map;
  }, [tasks]);

  const undated = tasks.filter((t) => !t.due_date);
  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="card p-4">
          <div className="mb-4 flex items-center justify-between">
          <p className="font-bold text-slate-950 capitalize">
            {format(month, "MMMM yyyy", { locale: fr })}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onToday} className="btn-ghost border text-xs px-3 py-1.5">
              Aujourd'hui
            </button>
            <button
              onClick={onPrev}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
              aria-label="Mois précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={onNext}
              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
              aria-label="Mois suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mb-1 grid grid-cols-7 gap-px text-center text-xs font-bold uppercase tracking-wide text-slate-700">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border-2 border-slate-400 bg-slate-400">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDay.get(key) || [];
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={key}
                className={`min-h-[92px] p-1.5 ${inMonth ? "bg-white" : "bg-slate-100"}`}
              >
                <div
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mb-1 ${
                    isToday
                      ? "bg-orange-500 text-white font-semibold"
                      : inMonth
                      ? "font-semibold text-slate-800"
                      : "font-medium text-slate-500"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onSelectTask(t)}
                      title={t.title}
                      className={`block w-full text-left truncate rounded-md px-1.5 py-1 text-xs transition ${
                        t.status === "termine"
                          ? "bg-emerald-100 font-semibold text-emerald-900 line-through"
                          : t.priority === "haute"
                          ? "bg-red-100 font-semibold text-red-900 hover:bg-red-200"
                          : "bg-orange-100 font-semibold text-orange-900 hover:bg-orange-200"
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="px-1.5 text-xs font-semibold text-slate-700">
                      +{dayTasks.length - 3} autre{dayTasks.length - 3 > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="card p-4">
          <p className="mb-2 text-sm font-bold text-slate-900">Sans échéance</p>
          <div className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTask(t)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-orange-300 hover:text-orange-800"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
