import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Target,
  Calendar,
  ShieldAlert,
  StickyNote,
  ListChecks,
  Plus,
  Check,
  Trash2,
  ArrowRightLeft,
} from "lucide-react";
import api from "../api";

const PIPELINE_STAGES = [
  { key: "prospect", label: "Prospect", dot: "bg-slate-400" },
  { key: "actif", label: "Actif", dot: "bg-emerald-500" },
  { key: "a_relancer", label: "À relancer", dot: "bg-amber-500" },
  { key: "dormant", label: "Dormant", dot: "bg-slate-300" },
];

function scoreTextColor(score) {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function TimelineEvent({ event }) {
  const date = event.date ? format(parseISO(event.date), "dd/MM/yyyy", { locale: fr }) : "—";

  if (event.type === "activity") {
    const score = event.data.reliability_score != null ? Number(event.data.reliability_score) : null;
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-1.5" />
          <div className="w-px flex-1 bg-slate-200" />
        </div>
        <div className="pb-5 min-w-0">
          <p className="text-xs text-slate-400">{date}</p>
          <p className="text-sm text-slate-800">
            Activité <span className="font-medium">{event.data.title}</span>
            {score != null && (
              <span className={`ml-2 text-xs font-semibold ${scoreTextColor(score)}`}>
                Fiabilité {score.toFixed(0)}%
              </span>
            )}
          </p>
        </div>
      </div>
    );
  }

  if (event.type === "note") {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5" />
          <div className="w-px flex-1 bg-slate-200" />
        </div>
        <div className="pb-5 min-w-0">
          <p className="text-xs text-slate-400">{date}</p>
          <p className="text-sm text-slate-800">
            Note{event.data.author_name ? ` de ${event.data.author_name}` : ""} :{" "}
            <span className="text-slate-600">{event.data.content}</span>
          </p>
        </div>
      </div>
    );
  }

  if (event.type === "task") {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-violet-500 mt-1.5" />
          <div className="w-px flex-1 bg-slate-200" />
        </div>
        <div className="pb-5 min-w-0">
          <p className="text-xs text-slate-400">{date}</p>
          <p className="text-sm text-slate-800">
            Tâche créée : <span className="font-medium">{event.data.title}</span>
            {event.data.completed && <span className="ml-2 text-xs text-emerald-600 font-medium">Terminée</span>}
          </p>
        </div>
      </div>
    );
  }

  if (event.type === "stage_change") {
    const stageLabel = (key) => PIPELINE_STAGES.find((s) => s.key === key)?.label || key || "—";
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-400 mt-1.5" />
          <div className="w-px flex-1 bg-slate-200" />
        </div>
        <div className="pb-5 min-w-0">
          <p className="text-xs text-slate-400">{date}</p>
          <p className="text-sm text-slate-800 flex items-center gap-1.5">
            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
            Stade changé {stageLabel(event.data.avant)} → {stageLabel(event.data.apres)}
            {event.data.user_full_name && (
              <span className="text-slate-400">par {event.data.user_full_name}</span>
            )}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default function PartenaireDetail() {
  const { id } = useParams();
  const [partner, setPartner] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newNote, setNewNote] = useState("");
  const [savingStage, setSavingStage] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [partnerRes, timelineRes, tasksRes, notesRes] = await Promise.all([
        api.get(`/partners/${id}`),
        api.get(`/partners/${id}/timeline`),
        api.get(`/partners/${id}/tasks`),
        api.get(`/partners/${id}/notes`),
      ]);
      setPartner(partnerRes.data);
      setTimeline(timelineRes.data);
      setTasks(tasksRes.data);
      setNotes(notesRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleStageChange = async (stage) => {
    setSavingStage(true);
    try {
      await api.patch(`/partners/${id}/pipeline-stage`, { pipeline_stage: stage });
      setPartner((p) => ({ ...p, pipeline_stage: stage }));
      fetchAll();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingStage(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      await api.post(`/partners/${id}/tasks`, { title: newTaskTitle.trim(), due_date: newTaskDue || null });
      setNewTaskTitle("");
      setNewTaskDue("");
      fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleTask = async (task) => {
    try {
      await api.patch(`/partners/${id}/tasks/${task.id}`, { completed: !task.completed });
      fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await api.delete(`/partners/${id}/tasks/${taskId}`);
      fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    try {
      await api.post(`/partners/${id}/notes`, { content: newNote.trim() });
      setNewNote("");
      fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      await api.delete(`/partners/${id}/notes/${noteId}`);
      fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading && !partner) {
    return <div className="min-h-[50vh] flex items-center justify-center text-slate-400">Chargement...</div>;
  }

  if (!partner) {
    return <div className="card p-8 text-center text-slate-500">Partenaire introuvable.</div>;
  }

  const objective = Number(partner.objective_beneficiaries || 0);
  const beneficiaries = Number(partner.beneficiaries_count || 0);
  const pct = objective > 0 ? Math.min(100, Math.round((beneficiaries / objective) * 100)) : 0;

  const activityScores = timeline
    .filter((e) => e.type === "activity" && e.data.reliability_score != null)
    .map((e) => Number(e.data.reliability_score));
  const avgReliability =
    activityScores.length > 0
      ? Math.round(activityScores.reduce((a, b) => a + b, 0) / activityScores.length)
      : null;

  const pendingTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);

  return (
    <div className="space-y-6">
      <Link to="/partenaires" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-orange-600">
        <ArrowLeft className="w-4 h-4" />
        Retour aux partenaires
      </Link>

      <div className="card-solid p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-500 text-white flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{partner.name}</h1>
              <p className="text-sm text-slate-500">{partner.description || "Aucune description"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                {partner.contact_email && (
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{partner.contact_email}</span>
                )}
                {partner.contact_phone && (
                  <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{partner.contact_phone}</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1.5 text-right">Stade du pipeline</p>
            <div className="flex gap-1">
              {PIPELINE_STAGES.map((stage) => (
                <button
                  key={stage.key}
                  disabled={savingStage}
                  onClick={() => handleStageChange(stage.key)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors disabled:opacity-50 ${
                    (partner.pipeline_stage || "actif") === stage.key
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
                  {stage.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500 mb-1">Activités</p>
            <p className="text-xl font-semibold text-slate-900">{Number(partner.activities_count || 0)}</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500 mb-1">Bénéficiaires</p>
            <p className="text-xl font-semibold text-slate-900">{beneficiaries}</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Target className="w-3 h-3" />Objectif</p>
            <p className="text-xl font-semibold text-slate-900">{pct}%</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-3">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />Fiabilité moy.</p>
            <p className={`text-xl font-semibold ${avgReliability != null ? scoreTextColor(avgReliability) : "text-slate-300"}`}>
              {avgReliability != null ? `${avgReliability}%` : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-solid p-5">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-orange-500" />
            Historique
          </h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun événement pour ce partenaire pour l'instant.</p>
          ) : (
            <div>
              {timeline.map((event, i) => (
                <TimelineEvent key={`${event.type}-${event.data.id}-${i}`} event={event} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card-solid p-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
              <ListChecks className="w-4 h-4 text-orange-500" />
              Tâches de suivi
            </h2>
            <form onSubmit={handleAddTask} className="flex flex-col gap-2 mb-3">
              <input
                className="input text-sm"
                placeholder="Nouvelle tâche..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  className="input text-sm flex-1"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                />
                <button type="submit" className="btn-primary text-sm shrink-0" disabled={!newTaskTitle.trim()}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </form>
            <div className="space-y-2">
              {pendingTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <button
                    onClick={() => handleToggleTask(task)}
                    className="mt-0.5 w-4 h-4 rounded border border-slate-300 shrink-0 hover:border-orange-500"
                    title="Marquer comme fait"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">{task.title}</p>
                    {task.due_date && (
                      <p className="text-xs text-slate-400">
                        Échéance : {format(parseISO(task.due_date), "dd/MM/yyyy", { locale: fr })}
                      </p>
                    )}
                  </div>
                  <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {pendingTasks.length === 0 && (
                <p className="text-xs text-slate-400">Aucune tâche en cours.</p>
              )}
              {doneTasks.length > 0 && (
                <details className="pt-1">
                  <summary className="text-xs text-slate-400 cursor-pointer">
                    {doneTasks.length} tâche{doneTasks.length !== 1 ? "s" : ""} terminée{doneTasks.length !== 1 ? "s" : ""}
                  </summary>
                  <div className="space-y-2 mt-2">
                    {doneTasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 opacity-60">
                        <button
                          onClick={() => handleToggleTask(task)}
                          className="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center shrink-0"
                        >
                          <Check className="w-3 h-3 text-white" />
                        </button>
                        <p className="text-sm text-slate-600 line-through flex-1 min-w-0">{task.title}</p>
                        <button onClick={() => handleDeleteTask(task.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>

          <div className="card-solid p-5">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2 mb-3">
              <StickyNote className="w-4 h-4 text-orange-500" />
              Notes internes
            </h2>
            <form onSubmit={handleAddNote} className="flex flex-col gap-2 mb-3">
              <textarea
                className="input text-sm"
                rows={2}
                placeholder="Ajouter une note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button type="submit" className="btn-primary text-sm self-end" disabled={!newNote.trim()}>
                Ajouter
              </button>
            </form>
            <div className="space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-700">{note.content}</p>
                    <button onClick={() => handleDeleteNote(note.id)} className="text-slate-300 hover:text-red-500 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {note.author_name || "—"} · {format(parseISO(note.created_at), "dd/MM/yyyy HH:mm", { locale: fr })}
                  </p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-xs text-slate-400">Aucune note pour l'instant.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
