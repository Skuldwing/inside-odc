import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addWeeks, format, parseISO, startOfWeek } from "date-fns";
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

function dateKey(date) {
  return format(date, "yyyy-MM-dd");
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
  const [weeklyPlans, setWeeklyPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [projectMemberIds, setProjectMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const currentWeek = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const nextWeek = useMemo(() => addWeeks(currentWeek, 1), [currentWeek]);

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
      const weeklyRes = await api.get("/mbootay/weekly-plans", {
        params: { from: dateKey(currentWeek), to: dateKey(nextWeek) },
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
    } catch (err) {
      console.error("Erreur chargement Mbootay", err);
      setError("Impossible de charger les projets Mbootay.");
    } finally {
      setLoading(false);
    }
  }, [currentWeek, nextWeek]);

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

  const addWeeklyItem = async (weekStart, title, parentId = null) => {
    if (!title.trim()) return;
    try {
      await api.post(`/mbootay/weekly-plans/${weekStart}/items`, { title: title.trim(), parent_id: parentId });
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

  const planFor = (weekStart) => weeklyPlans.find((plan) => String(plan.week_start).slice(0, 10) === dateKey(weekStart));

  return (
    <div className="space-y-8 pb-8">
      <header className="relative isolate overflow-hidden rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-900/10 sm:px-9 sm:py-9">
        <div className="absolute -right-12 -top-20 -z-10 h-72 w-72 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="absolute bottom-0 right-24 -z-10 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-orange-200">
              <KanbanSquare className="h-3.5 w-3.5" /> ESPACE COLLABORATIF ODC
            </span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Mbootay</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Les priorités de la semaine, les projets de l’équipe et leur progression au même endroit.
            </p>
          </div>
          <button onClick={openCreate} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-950/20 transition hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:ring-offset-2 focus:ring-offset-slate-950">
            <Plus className="h-4 w-4" /> Nouveau projet <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error && (
        <div className="card p-4 flex items-center gap-3 text-sm text-red-700 bg-red-50/70 border-red-200">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 sm:gap-4">
        <StatTile label="Projets suivis" value={stats.total} icon={Briefcase} tone="orange" hint="dans l’espace équipe" />
        <StatTile label="En cours" value={stats.enCours} icon={Activity} tone="amber" hint="actifs maintenant" />
        <StatTile label="Terminés" value={stats.termines} icon={CheckCircle2} tone="green" hint="projets clôturés" />
        <StatTile label="Points ouverts" value={stats.tasksOpen} icon={ListTodo} tone="slate" hint="à faire dans les projets" />
      </div>

      <section className="space-y-5 rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-orange-700">
              <CalendarDays className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide">Ordre du jour partagé</span>
            </div>
            <h2 className="text-xl font-bold text-slate-950">Prévisions et suivi de l’équipe</h2>
            <p className="mt-1 text-sm text-slate-700">Ajoutez les grands points prévus, puis détaillez-les en sous-points à cocher. Toute l’équipe Mbootay peut contribuer.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <WeeklyColumn
            title="À terminer cette semaine"
            range={`Semaine du ${format(currentWeek, "d MMMM", { locale: fr })}`}
            weekStart={dateKey(currentWeek)}
            items={planFor(currentWeek)?.items || []}
            onAdd={addWeeklyItem}
            onToggle={toggleWeeklyItem}
          />
          <WeeklyColumn
            title="À prévoir la semaine prochaine"
            range={`Semaine du ${format(nextWeek, "d MMMM", { locale: fr })}`}
            weekStart={dateKey(nextWeek)}
            items={planFor(nextWeek)?.items || []}
            onAdd={addWeeklyItem}
            onToggle={toggleWeeklyItem}
          />
        </div>
        <p className="text-xs font-medium text-slate-700">Les listes sont partagées avec les membres de l’équipe autorisés à utiliser Mbootay. Seule la semaine est indiquée ; les points n’ont pas de date ni de responsable individuel.</p>
      </section>

      {myTasks.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <ListTodo className="w-4 h-4 text-orange-500" />
            <p className="font-semibold text-slate-900">Mes tâches en cours</p>
            <span className="ml-auto text-xs text-slate-500">{myTasks.length}</span>
          </div>
          <div className="space-y-2">
            {myTasks.slice(0, 6).map((t) => (
              <Link
                key={t.id}
                to={`/mbootay/${t.project_id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 transition hover:border-orange-200 hover:bg-orange-50/40"
              >
                <span className="text-sm text-slate-800 flex-1 truncate">{t.title}</span>
                <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[150px]">
                  {t.project_title}
                </span>
                {t.due_date && <DueBadge date={t.due_date} />}
              </Link>
            ))}
          </div>
        </div>
      )}

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
              {PROJECT_STATUSES.map((s) => (
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

      {open && (
        <AdminModal
          title={editing ? "Modifier le projet" : "Nouveau projet"}
          onClose={() => setOpen(false)}
          maxWidth="max-w-3xl"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
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

function WeeklyColumn({ title, range, weekStart, items, onAdd, onToggle }) {
  const [mainDraft, setMainDraft] = useState("");
  const [subDraft, setSubDraft] = useState("");
  const [addingUnder, setAddingUnder] = useState(null);
  const allItems = items.flatMap((item) => [item, ...(item.children || [])]);
  const doneCount = allItems.filter((item) => item.done).length;

  const submitMain = async (event) => {
    event.preventDefault();
    if (!mainDraft.trim()) return;
    if (await onAdd(weekStart, mainDraft)) setMainDraft("");
  };

  const submitSub = async (event) => {
    event.preventDefault();
    if (!subDraft.trim() || !addingUnder) return;
    if (await onAdd(weekStart, subDraft, addingUnder)) {
      setSubDraft("");
      setAddingUnder(null);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-3 border-b-2 border-slate-200 pb-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Clock3 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-950">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-slate-600">{range}</p>
        </div>
        <span className="ml-auto rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800">{doneCount} / {allItems.length} terminés</span>
      </div>
      <form onSubmit={submitMain} className="flex gap-2 mb-3">
        <input className="input min-w-0 flex-1 !border-slate-300 !bg-white text-sm !text-slate-950 placeholder:!text-slate-500" value={mainDraft} onChange={(event) => setMainDraft(event.target.value)} placeholder="Ajouter un grand point…" aria-label={`Ajouter un grand point ${title.toLowerCase()}`} />
        <button type="submit" className="btn-primary px-3" disabled={!mainDraft.trim()} aria-label="Ajouter le grand point"><Plus className="w-4 h-4" /></button>
      </form>
      {items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm font-medium text-slate-700">
          La liste est vide. Ajoutez un grand point pour commencer.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className={`rounded-xl border-2 p-3.5 transition ${item.done ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => onToggle(item)} className="mt-0.5 rounded focus:outline-none focus:ring-2 focus:ring-orange-500" title={item.done ? "Marquer comme non terminé" : "Marquer comme terminé"}>
                  {item.done ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <Circle className="h-5 w-5 text-slate-500" />}
                </button>
                <p className={`min-w-0 flex-1 text-sm font-bold leading-5 ${item.done ? "text-slate-600 line-through decoration-2" : "text-slate-950"}`}>{item.title}</p>
                <button type="button" onClick={() => { setAddingUnder(addingUnder === item.id ? null : item.id); setSubDraft(""); }} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-orange-800 transition hover:bg-orange-50">
                  <Plus className="w-3.5 h-3.5" /> Sous-point
                </button>
              </div>
              {(item.children || []).length > 0 && (
                <div className="ml-2 mt-3 space-y-1.5 border-l-[3px] border-slate-400 pl-3">
                  {item.children.map((child) => (
                    <div key={child.id} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${child.done ? "bg-emerald-50" : "bg-white"}`}>
                      <button type="button" onClick={() => onToggle(child)} className="mt-0.5 rounded focus:outline-none focus:ring-2 focus:ring-orange-500" title={child.done ? "Marquer comme non terminé" : "Marquer comme terminé"}>
                        {child.done ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : <Circle className="h-4 w-4 text-slate-500" />}
                      </button>
                      <p className={`text-sm leading-5 ${child.done ? "font-medium text-slate-600 line-through decoration-2" : "font-semibold text-slate-900"}`}>{child.title}</p>
                    </div>
                  ))}
                </div>
              )}
              {addingUnder === item.id && (
                <form onSubmit={submitSub} className="ml-6 mt-2 flex gap-2">
                  <input autoFocus className="input min-w-0 flex-1 !border-slate-300 !bg-white !text-slate-950 placeholder:!text-slate-500 text-sm" value={subDraft} onChange={(event) => setSubDraft(event.target.value)} placeholder="Nom du sous-point…" aria-label="Nom du sous-point" />
                  <button type="submit" className="rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={!subDraft.trim()}>Ajouter</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, tone = "slate", hint }) {
  const tones = {
    orange: "bg-orange-50 text-orange-600 ring-orange-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    green: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${tones[tone] || tones.slate}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">ODC</span>
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        <p className="pb-1 text-right text-[11px] text-slate-400">{hint}</p>
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
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg hover:shadow-slate-900/5"
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

      <div className="mt-4 grid grid-cols-2 gap-2">
        <ProjectDetail icon={Users} label="Responsable" value={project.owner_name || "À définir"} />
        <ProjectDetail icon={Building2} label="Partenaire" value={project.partner_name || "Aucun partenaire"} />
        <ProjectDetail icon={Layers} label="Dispositif" value={project.device_name || "Aucun dispositif"} />
        <ProjectDetail
          icon={CalendarDays}
          label="Période"
          value={project.start_date || project.due_date
            ? `${project.start_date ? format(parseISO(String(project.start_date).slice(0, 10)), "d MMM yy", { locale: fr }) : "Début à définir"} → ${project.due_date ? format(parseISO(String(project.due_date).slice(0, 10)), "d MMM yy", { locale: fr }) : "Sans échéance"}`
            : "À planifier"}
          wide
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

function ProjectDetail({ icon: Icon, label, value, wide = false }) {
  return (
    <div className={`min-w-0 rounded-lg border border-slate-100 bg-white px-3 py-2.5 ${wide ? "col-span-2" : ""}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3.5 w-3.5 text-slate-400" /> {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-800" title={value}>{value}</p>
    </div>
  );
}
