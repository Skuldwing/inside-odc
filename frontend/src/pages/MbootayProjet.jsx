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
  Columns3,
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
import AdminModal from "../components/admin/AdminModal";
import { projectStatusMeta } from "./Mbootay";

const TASK_COLUMNS = [
  { key: "a_faire", label: "À faire", dot: "bg-slate-400" },
  { key: "en_cours", label: "En cours", dot: "bg-orange-500" },
  { key: "termine", label: "Terminé", dot: "bg-emerald-500" },
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
      await fetchAll();
    } catch (err) {
      console.error("Erreur enregistrement tâche", err);
      alert(err.response?.data?.error || "Erreur lors de l'enregistrement");
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (task) => {
    if (!window.confirm(`Supprimer la tâche "${task.title}" ?`)) return;
    try {
      await api.delete(`/mbootay/tasks/${task.id}`);
      await fetchAll();
    } catch (err) {
      console.error("Erreur suppression tâche", err);
      alert("Suppression impossible");
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
      alert("Déplacement impossible");
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
      await fetchAll();
    } catch (err) {
      console.error("Erreur enregistrement membres", err);
      alert("Enregistrement impossible");
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
      <div className="card p-5 space-y-4">
        <Link
          to="/mbootay"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-orange-600 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Mbootay
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="page-title">{project?.title}</h1>
            {project?.description && (
              <p className="page-subtitle max-w-2xl">{project.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className={`badge border-transparent ${meta.badge}`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${meta.dot}`} />
                {meta.label}
              </span>
              {project?.owner_name && (
                <span className="badge bg-slate-100 border-slate-200 text-slate-600">
                  <Users className="w-3 h-3 mr-1.5" />
                  {project.owner_name}
                </span>
              )}
              {project?.partner_name && (
                <span className="badge bg-slate-100 border-slate-200 text-slate-600">
                  <Building2 className="w-3 h-3 mr-1.5" />
                  {project.partner_name}
                </span>
              )}
              {project?.device_name && (
                <span className="badge bg-slate-100 border-slate-200 text-slate-600">
                  <Layers className="w-3 h-3 mr-1.5" />
                  {project.device_name}
                </span>
              )}
              {project?.due_date && (
                <span className="badge bg-slate-100 border-slate-200 text-slate-600">
                  <CalendarDays className="w-3 h-3 mr-1.5" />
                  Échéance {format(toDateOnly(project.due_date), "d MMM yyyy", { locale: fr })}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={openMembers} className="btn-ghost border">
              <Users className="w-4 h-4" />
              Membres ({members.length})
            </button>
            <button onClick={() => openCreateTask()} className="btn-primary">
              <Plus className="w-4 h-4" />
              Nouvelle tâche
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Avancement</span>
            <span className="font-medium text-slate-700">
              {progress.done}/{progress.total} tâches · {progress.pct}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bascule de vue */}
      <div className="flex items-center gap-2">
        <ViewToggle active={view === "kanban"} onClick={() => setView("kanban")} icon={Columns3}>
          Kanban
        </ViewToggle>
        <ViewToggle active={view === "calendrier"} onClick={() => setView("calendrier")} icon={CalendarDays}>
          Calendrier
        </ViewToggle>
      </div>

      {view === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                className={`rounded-2xl border p-3 min-h-[240px] transition ${
                  dragOverColumn === column.key
                    ? "border-orange-300 bg-orange-50/60"
                    : "border-slate-200 bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-2 px-1 mb-3">
                  <span className={`w-2 h-2 rounded-full ${column.dot}`} />
                  <p className="text-sm font-semibold text-slate-700">{column.label}</p>
                  <span className="ml-auto text-xs text-slate-400">{columnTasks.length}</span>
                </div>

                <div className="space-y-2">
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => {
                        setDraggedId(null);
                        setDragOverColumn(null);
                      }}
                      dragging={String(draggedId) === String(task.id)}
                      onEdit={() => openEditTask(task)}
                      onDelete={() => handleDeleteTask(task)}
                    />
                  ))}
                </div>

                <button
                  onClick={() => openCreateTask(column.key)}
                  className="mt-2 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 transition hover:border-orange-300 hover:text-orange-600"
                >
                  + Ajouter une tâche
                </button>
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
          <form onSubmit={handleTaskSubmit} className="space-y-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Statut</label>
                <select
                  className="select"
                  value={taskForm.status}
                  onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                >
                  {TASK_COLUMNS.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
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
                <p className="px-4 py-3 text-sm text-slate-500">Aucun membre disponible</p>
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
                  <span className="text-xs text-slate-400">{u.role}</span>
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
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

function TaskCard({ task, onDragStart, onDragEnd, dragging, onEdit, onDelete }) {
  const prio = priorityMeta(task.priority);
  const due = toDateOnly(task.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const late = due && due < today && task.status !== "termine";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition cursor-grab active:cursor-grabbing hover:border-orange-200 ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-3.5 h-3.5 text-slate-300 mt-0.5 flex-shrink-0" />
        <p
          className={`text-sm flex-1 ${
            task.status === "termine" ? "text-slate-400 line-through" : "text-slate-800"
          }`}
        >
          {task.title}
        </p>
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition flex-shrink-0">
          <button onClick={onEdit} className="text-slate-400 hover:text-orange-500" title="Modifier">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="text-slate-400 hover:text-red-500" title="Supprimer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pl-5">
        <span className={`badge border-transparent ${prio.badge}`}>{prio.label}</span>
        {due && (
          <span
            className={`badge ${
              late
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            {format(due, "d MMM", { locale: fr })}
          </span>
        )}
        {task.assigned_name && (
          <span className="text-xs text-slate-400 truncate max-w-[110px]">{task.assigned_name}</span>
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
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-slate-900 capitalize">
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

        <div className="grid grid-cols-7 gap-px text-center text-[11px] uppercase tracking-wide text-slate-400 mb-1">
          {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDay.get(key) || [];
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            return (
              <div
                key={key}
                className={`min-h-[92px] bg-white p-1.5 ${inMonth ? "" : "bg-slate-50/80"}`}
              >
                <div
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs mb-1 ${
                    isToday
                      ? "bg-orange-500 text-white font-semibold"
                      : inMonth
                      ? "text-slate-600"
                      : "text-slate-300"
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
                      className={`block w-full text-left truncate rounded-md px-1.5 py-1 text-[11px] transition ${
                        t.status === "termine"
                          ? "bg-emerald-50 text-emerald-700 line-through"
                          : t.priority === "haute"
                          ? "bg-red-50 text-red-700 hover:bg-red-100"
                          : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="text-[10px] text-slate-400 px-1.5">
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
          <p className="text-sm font-semibold text-slate-700 mb-2">Sans échéance</p>
          <div className="flex flex-wrap gap-2">
            {undated.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectTask(t)}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition hover:border-orange-200 hover:text-orange-600"
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
