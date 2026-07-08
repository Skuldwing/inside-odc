import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  MapPin,
  Search,
  Filter,
  Pencil,
  Trash2,
  Users,
  FileSpreadsheet,
  ScanSearch,
  Link2,
  CheckCircle2,
  Download,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  QrCode,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { useAuth } from "../auth/useAuth";

const importSteps = [
  { key: "upload", label: "Upload", icon: FileSpreadsheet },
  { key: "validation", label: "Validation", icon: ScanSearch },
  { key: "mapping", label: "Mapping", icon: Link2 },
  { key: "resultat", label: "Resultat", icon: CheckCircle2 },
];

export default function Activities({
  forceUploadOpen = false,
  initialSearchQuery = "",
}) {
  const { role, user, isViewer } = useAuth();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [activities, setActivities] = useState([]);
  const [devices, setDevices] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openUpload, setOpenUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState(null);
  const [importStep, setImportStep] = useState(0);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [viewMode, setViewMode] = useState("liste");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [qrActivity, setQrActivity] = useState(null);

  const [editForm, setEditForm] = useState({
    id: null,
    title: "",
    description: "",
    activity_date: "",
    duration_hours: "",
    location: "",
    device_id: "",
    partner_id: "",
    participants_manual: "",
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    activity_date: "",
    duration_hours: "",
    location: "",
    device_id: "",
    partner_id: "",
    participants_manual: "",
    file: null,
  });

  const senegalRegions = [
    "Dakar",
    "Diourbel",
    "Fatick",
    "Kaffrine",
    "Kaolack",
    "Kedougou",
    "Kolda",
    "Louga",
    "Matam",
    "Saint-Louis",
    "Sedhiou",
    "Tambacounda",
    "Thies",
    "Ziguinchor",
  ];

  const fetchActivities = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/activities");
      const today = new Date().toISOString().slice(0, 10);
      const mapped = (res.data || []).map((a) => {
        const date = a.activity_date ? String(a.activity_date).slice(0, 10) : "";
        let computedStatus = "planned";
        if (date) {
          if (date < today) computedStatus = "completed";
          else if (date === today) computedStatus = "ongoing";
        }
        const statusValue = a.status || computedStatus;

        return {
          id: a.id,
          title: a.title || "Activite sans titre",
          description: a.description || "",
          partner_id: a.partner_id || null,
          partner: a.partner_name || "-",
          device_id: a.device_id || null,
          device: a.device_name || "-",
          location: a.location || "-",
          date,
          duration_hours: a.duration_hours || "",
          participants: a.participants_count ?? 0,
          participants_manual: a.participants_manual ?? null,
          status: statusValue,
          statusLabel:
            statusValue === "completed"
              ? "Terminee"
              : statusValue === "ongoing"
              ? "En cours"
              : "Planifiee",
        };
      });
      setActivities(mapped);
    } catch {
      setError("Erreur de chargement des activites.");
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await api.get("/devices");
      setDevices(res.data || []);
    } catch {
      setDevices([]);
    }
  };

  const fetchPartners = async () => {
    try {
      const res = await api.get("/partners");
      setPartners(res.data || []);
    } catch {
      setPartners([]);
    }
  };

  useEffect(() => {
    fetchActivities();
    fetchDevices();
    if (role === "admin") fetchPartners();
  }, [role]);

  useEffect(() => {
    setSearch(initialSearchQuery || "");
  }, [initialSearchQuery]);

  useEffect(() => {
    if (forceUploadOpen && !isViewer && !hasAutoOpened) {
      setOpenUpload(true);
      setImportStep(1);
      setHasAutoOpened(true);
    }
    if (!forceUploadOpen && hasAutoOpened) {
      setHasAutoOpened(false);
    }
  }, [forceUploadOpen, isViewer, hasAutoOpened]);

  const deviceOptions = useMemo(() => {
    if (devices.length > 0) {
      return devices.map((d) => ({ id: String(d.id), name: d.name }));
    }
    const map = new Map();
    activities.forEach((a) => {
      if (a.device && a.device !== "-") {
        map.set(String(a.device_id || a.device), a.device);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [devices, activities]);

  const filteredActivities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((a) => {
      if (role === "admin" && partnerFilter) {
        if (String(a.partner_id) !== String(partnerFilter)) return false;
      }
      if (deviceFilter) {
        if (String(a.device_id || "") !== String(deviceFilter)) return false;
      }
      if (status !== "all" && a.status !== status) return false;
      if (q && !(a.title || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activities, role, partnerFilter, deviceFilter, status, search]);

  const stats = useMemo(() => {
    const total = filteredActivities.length;
    const planned = filteredActivities.filter((a) => a.status === "planned").length;
    const ongoing = filteredActivities.filter((a) => a.status === "ongoing").length;
    const completed = filteredActivities.filter((a) => a.status === "completed").length;
    return { total, planned, ongoing, completed };
  }, [filteredActivities]);

  const resetForm = () => {
    setForm({
      title: "",
      description: "",
      activity_date: "",
      duration_hours: "",
      location: "",
      device_id: "",
      partner_id: "",
      participants_manual: "",
      file: null,
    });
    setUploadError("");
    setUploadResult(null);
    setImportStep(1);
  };

  const openUploadModal = () => {
    resetForm();
    setOpenUpload(true);
  };

  const closeUploadModal = () => {
    setOpenUpload(false);
    setUploadError("");
    setUploadResult(null);
    setImportStep(0);
  };

  const openEdit = (activity) => {
    setEditError("");
    setEditForm({
      id: activity.id,
      title: activity.title || "",
      description: activity.description || "",
      activity_date: activity.date || "",
      duration_hours: activity.duration_hours || "",
      location: activity.location === "-" ? "" : activity.location || "",
      device_id: activity.device_id || "",
      partner_id: activity.partner_id || "",
      participants_manual: activity.participants_manual ?? "",
    });
    setEditOpen(true);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError("");
    try {
      const payload = {
        title: editForm.title,
        description: editForm.description,
        activity_date: editForm.activity_date,
        duration_hours: editForm.duration_hours || null,
        location: editForm.location || null,
        device_id: editForm.device_id || null,
        participants_manual: editForm.participants_manual !== "" ? Number(editForm.participants_manual) : null,
      };
      if (role === "admin") payload.partner_id = editForm.partner_id || null;

      await api.put(`/activities/${editForm.id}`, payload);
      setEditOpen(false);
      fetchActivities();
    } catch (err) {
      setEditError(err.response?.data?.error || "Erreur mise a jour activite");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (activityId) => {
    if (!confirm("Supprimer cette activite definitivement ?")) return;
    setDeleteError("");
    try {
      await api.delete(`/activities/${activityId}`);
      fetchActivities();
    } catch (err) {
      setDeleteError(err.response?.data?.error || "Erreur suppression activite");
    }
  };

  const handleExportActivity = async (activity) => {
    try {
      const res = await api.get(`/activities/${activity.id}/participants/export`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `presences_${activity.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Erreur lors du telechargement de la liste.");
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError("");
    setUploadResult(null);
    setUploading(true);

    try {
      if (form.file) {
        // Avec liste Excel → import complet
        setImportStep(2);
        setImportStep(3);
        const fd = new FormData();
        fd.append("title", form.title);
        fd.append("description", form.description);
        fd.append("activity_date", form.activity_date);
        if (form.duration_hours) fd.append("duration_hours", form.duration_hours);
        fd.append("location", form.location);
        if (form.device_id) fd.append("device_id", form.device_id);
        if (role === "admin" && form.partner_id) {
          fd.append("partner_id", form.partner_id);
        } else if (role === "partner" && user?.partner_id) {
          fd.append("partner_id", user.partner_id);
        }
        if (form.participants_manual !== "") fd.append("participants_manual", form.participants_manual);
        fd.append("file", form.file);
        const res = await api.post("/import/activity", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setUploadResult(res.data || {});
      } else {
        // Sans fichier → création simple
        const payload = {
          title: form.title,
          description: form.description,
          activity_date: form.activity_date,
          duration_hours: form.duration_hours || null,
          location: form.location || null,
          device_id: form.device_id || null,
          participants_manual: form.participants_manual !== "" ? Number(form.participants_manual) : null,
          partner_id:
            role === "admin"
              ? form.partner_id || null
              : role === "partner"
              ? user?.partner_id || null
              : null,
        };
        const res = await api.post("/activities", payload);
        setUploadResult({
          sans_fichier: true,
          activity: res.data,
          participants_importes: 0,
          total_lignes: 0,
          lignes_ignorees_nom_prenom_manquants: 0,
          doublons_dans_activite: 0,
        });
      }
      setImportStep(4);
      fetchActivities();
    } catch (err) {
      setUploadError(err.response?.data?.error || "Erreur creation activite");
      setImportStep(1);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-glass p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Operations
            </p>
            <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
              Activites
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Gestion, import Excel et suivi des activites terrain.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("liste")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === "liste" ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                <List className="w-4 h-4" />
                Liste
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendrier")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${viewMode === "calendrier" ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              >
                <CalendarDays className="w-4 h-4" />
                Calendrier
              </button>
            </div>
            {!isViewer && (
              <button className="btn-primary" onClick={openUploadModal}>
                <Plus className="w-4 h-4" />
                Nouvelle activite
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <CountCard label="Total" value={stats.total} />
        <CountCard label="Planifiees" value={stats.planned} />
        <CountCard label="En cours" value={stats.ongoing} />
        <CountCard label="Terminees" value={stats.completed} />
      </section>

      <section className="card p-4 lg:p-5">
        <div className="flex items-center gap-2 text-slate-700">
          <Filter className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Filtres</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Rechercher une activite..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>

          {role === "admin" ? (
            <select
              className="select"
              value={partnerFilter}
              onChange={(e) => setPartnerFilter(e.target.value)}
            >
              <option value="">Tous les partenaires</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="hidden md:block" />
          )}

          <select
            className="select"
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
          >
            <option value="">Tous les dispositifs</option>
            {deviceOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tous les statuts</option>
            <option value="planned">Planifiee</option>
            <option value="ongoing">En cours</option>
            <option value="completed">Terminee</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error}
        </div>
      )}
      {deleteError && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {deleteError}
        </div>
      )}

      {viewMode === "calendrier" ? (
        <CalendarView
          activities={filteredActivities}
          calendarDate={calendarDate}
          onDateChange={setCalendarDate}
          canEdit={!isViewer}
          onEdit={openEdit}
          onDelete={handleDelete}
          onQrCode={setQrActivity}
          onExport={handleExportActivity}
        />
      ) : (
        <div className="space-y-4">
          {loading && <div className="card p-6 text-center text-slate-500">Chargement...</div>}
          {!loading && filteredActivities.length === 0 && (
            <div className="card p-6 text-center text-slate-500">Aucune activite trouvee</div>
          )}
          {filteredActivities.map((activity) => (
            <ActivityCard
              key={activity.id}
              activity={activity}
              canEdit={!isViewer}
              onEdit={() => openEdit(activity)}
              onDelete={() => handleDelete(activity.id)}
              onQrCode={() => setQrActivity(activity)}
              onExport={() => handleExportActivity(activity)}
            />
          ))}
        </div>
      )}

      {openUpload && (
        <ActivityModal
          title="Nouvelle activite"
          maxWidthClass="max-w-2xl"
          error={uploadError}
          onClose={closeUploadModal}
        >
          <ImportStepper currentStep={importStep} />

          {uploadResult ? (
            <ImportResultSummary result={uploadResult} />
          ) : (
            <form onSubmit={handleUpload} className="space-y-4 mt-4">
              <FormActivityFields
                role={role}
                form={form}
                setForm={setForm}
                partners={partners}
                devices={devices}
                regions={senegalRegions}
              />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <label className="text-sm font-medium">Liste de presences Excel</label>
                    <span className="ml-2 text-xs text-slate-400">(optionnel — peut etre ajoute plus tard)</span>
                  </div>
                  <a
                    href={`${import.meta.env.VITE_API_URL}/import/template`}
                    download="template_liste_presences.xlsx"
                    className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium"
                  >
                    <Download className="w-3 h-3" />
                    Telecharger le template
                  </a>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="mt-1"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeUploadModal} className="btn-ghost border">
                  Annuler
                </button>
                <button type="submit" disabled={uploading} className="btn-primary disabled:opacity-60">
                  {uploading
                    ? "Enregistrement..."
                    : form.file
                    ? "Creer et importer la liste"
                    : "Creer l activite"}
                </button>
              </div>
            </form>
          )}

          {uploadResult && (
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="btn-ghost border"
                onClick={openUploadModal}
              >
                Nouvelle activite
              </button>
              <button type="button" className="btn-primary" onClick={closeUploadModal}>
                Terminer
              </button>
            </div>
          )}
        </ActivityModal>
      )}

      {qrActivity && (
        <QrModal activity={qrActivity} onClose={() => setQrActivity(null)} />
      )}

      {editOpen && (
        <ActivityModal
          title="Modifier activite"
          error={editError}
          onClose={() => setEditOpen(false)}
        >
          <form onSubmit={handleEditSave} className="space-y-4">
            <FormActivityFields
              role={role}
              form={editForm}
              setForm={setEditForm}
              partners={partners}
              devices={devices}
              regions={senegalRegions}
            />

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => setEditOpen(false)} className="btn-ghost border">
                Annuler
              </button>
              <button type="submit" disabled={editSaving} className="btn-primary disabled:opacity-60">
                {editSaving ? "Sauvegarde..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </ActivityModal>
      )}
    </div>
  );
}

function ImportStepper({ currentStep }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
      {importSteps.map((step, idx) => {
        const index = idx + 1;
        const active = currentStep >= index;
        const Icon = step.icon;
        return (
          <div
            key={step.key}
            className={`rounded-xl border px-3 py-2 text-xs ${
              active
                ? "border-orange-300 bg-orange-50 text-orange-700"
                : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <Icon className="h-3.5 w-3.5" />
              <span>{index}. {step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImportResultSummary({ result }) {
  const imported = result.participants_importes ?? 0;
  const total = result.total_lignes ?? 0;
  const ignored = result.lignes_ignorees_nom_prenom_manquants ?? 0;
  const duplicates = result.doublons_dans_activite ?? 0;

  if (result.sans_fichier) {
    return (
      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          Activite creee avec succes.
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 text-sm">
          Aucune liste de presences importee. Vous pourrez l&apos;ajouter ulterieurement via le bouton &laquo;&nbsp;Modifier&nbsp;&raquo;.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
        Activite creee et liste importee avec succes.
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Lignes Excel" value={total} />
        <SummaryCard label="Importees" value={imported} />
        <SummaryCard label="Ignorees" value={ignored} />
        <SummaryCard label="Doublons" value={duplicates} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function FormActivityFields({ role, form, setForm, partners, devices, regions }) {
  return (
    <>
      <div>
        <label className="text-sm font-medium">Intitule *</label>
        <input
          required
          className="input mt-1"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Description</label>
        <textarea
          className="input mt-1 min-h-20"
          value={form.description || ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Date *</label>
        <input
          type="date"
          required
          className="input mt-1"
          value={form.activity_date}
          onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Duree (heures)</label>
        <input
          type="number"
          min="0"
          className="input mt-1"
          value={form.duration_hours}
          onChange={(e) => setForm({ ...form, duration_hours: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Nombre de presences (estime)</label>
        <p className="text-xs text-slate-400 mb-1">Remplacement temporaire avant import Excel. Remplace automatiquement par le vrai compte une fois la liste importee.</p>
        <input
          type="number"
          min="0"
          className="input mt-1"
          placeholder="Ex: 45"
          value={form.participants_manual ?? ""}
          onChange={(e) => setForm({ ...form, participants_manual: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Lieu</label>
        <select
          className="select mt-1"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        >
          <option value="">Selectionner une region</option>
          {regions.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
      </div>

      {role === "admin" && (
        <div>
          <label className="text-sm font-medium">Partenaire</label>
          <select
            className="select mt-1"
            value={form.partner_id}
            onChange={(e) => setForm({ ...form, partner_id: e.target.value })}
          >
            <option value="">Selectionner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-sm font-medium">Dispositif</label>
        <select
          className="select mt-1"
          value={form.device_id}
          onChange={(e) => setForm({ ...form, device_id: e.target.value })}
        >
          <option value="">Selectionner</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

/* ── Calendrier ── */
const STATUS_COLORS = {
  planned: { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  ongoing: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

function CalendarView({ activities, calendarDate, onDateChange, canEdit, onEdit, onDelete, onQrCode, onExport }) {
  const [selectedDay, setSelectedDay] = useState(null);

  const monthStart = startOfMonth(calendarDate);
  const monthEnd = endOfMonth(calendarDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Lundi = 0, ..., Dimanche = 6
  const startPad = (getDay(monthStart) + 6) % 7;

  const activitiesByDate = useMemo(() => {
    const map = {};
    activities.forEach((a) => {
      if (!a.date) return;
      if (!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    return map;
  }, [activities]);

  const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const prevMonth = () => onDateChange(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  const nextMonth = () => onDateChange(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  const goToday = () => { onDateChange(new Date()); setSelectedDay(null); };

  const selectedActivities = selectedDay ? (activitiesByDate[selectedDay] || []) : [];

  return (
    <div className="space-y-4">
      <div className="card p-4 lg:p-5">
        {/* Header navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={prevMonth} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <h2 className="text-base font-semibold text-slate-900 capitalize min-w-[160px] text-center">
              {format(calendarDate, "MMMM yyyy", { locale: fr })}
            </h2>
            <button type="button" onClick={nextMonth} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          <button type="button" onClick={goToday} className="btn-ghost border text-sm">
            Aujourd hui
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
          {/* Headers */}
          {dayNames.map((d) => (
            <div key={d} className="bg-slate-50 py-2 text-center text-xs font-semibold text-slate-500">
              {d}
            </div>
          ))}

          {/* Padding cells */}
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className="bg-white min-h-[80px] p-1 lg:min-h-[100px]" />
          ))}

          {/* Day cells */}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayActivities = activitiesByDate[key] || [];
            const isSelected = selectedDay === key;
            const todayDay = isToday(day);

            return (
              <div
                key={key}
                onClick={() => setSelectedDay(isSelected ? null : key)}
                className={`bg-white min-h-[80px] lg:min-h-[100px] p-1.5 cursor-pointer transition-colors ${
                  isSelected ? "bg-orange-50" : "hover:bg-slate-50"
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${
                  todayDay
                    ? "bg-orange-500 text-white"
                    : isSelected
                    ? "bg-orange-100 text-orange-700"
                    : "text-slate-700"
                }`}>
                  {format(day, "d")}
                </div>

                <div className="space-y-0.5">
                  {dayActivities.slice(0, 2).map((a) => {
                    const c = STATUS_COLORS[a.status] || STATUS_COLORS.planned;
                    return (
                      <div key={a.id} className={`rounded px-1 py-0.5 text-[10px] leading-tight truncate font-medium ${c.bg} ${c.text}`}>
                        {a.title}
                      </div>
                    );
                  })}
                  {dayActivities.length > 2 && (
                    <div className="text-[10px] text-slate-400 px-1">+{dayActivities.length - 2}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Légende */}
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          {Object.entries(STATUS_COLORS).map(([status, c]) => (
            <span key={status} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
              {status === "planned" ? "Planifiee" : status === "ongoing" ? "En cours" : "Terminee"}
            </span>
          ))}
        </div>
      </div>

      {/* Détail du jour sélectionné */}
      {selectedDay && (
        <div className="card p-4">
          <p className="font-semibold text-slate-900 mb-3 capitalize">
            {format(parseISO(selectedDay), "EEEE d MMMM yyyy", { locale: fr })}
            <span className="ml-2 text-sm font-normal text-slate-500">
              {selectedActivities.length} activite{selectedActivities.length > 1 ? "s" : ""}
            </span>
          </p>
          {selectedActivities.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune activite ce jour.</p>
          ) : (
            <div className="space-y-3">
              {selectedActivities.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  canEdit={canEdit}
                  onEdit={() => onEdit(activity)}
                  onDelete={() => onDelete(activity.id)}
                  onQrCode={() => onQrCode && onQrCode(activity)}
                  onExport={() => onExport && onExport(activity)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CountCard({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function ActivityModal({
  title,
  children,
  error = "",
  onClose,
  maxWidthClass = "max-w-lg",
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4 py-4">
      <div className={`card-solid w-full ${maxWidthClass} flex flex-col max-h-[90vh]`}>
        {/* Header fixe */}
        <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost border">
            Fermer
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="overflow-y-auto flex-1 px-6 pb-6">
          {error && (
            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 mb-4">
              {error}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function QrModal({ activity, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  const checkinUrl = `${window.location.origin}/checkin/${activity.id}`;

  useEffect(() => {
    QRCode.toDataURL(checkinUrl, { width: 400, margin: 2, color: { dark: "#1e293b", light: "#ffffff" } })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [checkinUrl]);

  const handleDownload = () => {
    const qrSize = 400;
    const padding = 24;
    const textAreaHeight = 72;
    const canvas = document.createElement("canvas");
    canvas.width = qrSize + padding * 2;
    canvas.height = qrSize + padding * 2 + textAreaHeight;
    const ctx = canvas.getContext("2d");

    // Fond blanc
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // QR code
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, qrSize, qrSize);

      // Titre
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      const maxWidth = canvas.width - padding * 2;
      ctx.fillText(activity.title, canvas.width / 2, qrSize + padding + 32, maxWidth);

      // Date
      if (activity.date) {
        ctx.fillStyle = "#64748b";
        ctx.font = "16px sans-serif";
        ctx.fillText(activity.date, canvas.width / 2, qrSize + padding + 58, maxWidth);
      }

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `checkin-qr-${activity.id}.png`;
      a.click();
    };
    img.src = dataUrl;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="card-solid w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-orange-500 font-semibold">QR Code Check-in</p>
            <h3 className="font-semibold text-slate-900 mt-0.5 leading-tight">{activity.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex flex-col items-center mb-4">
          {dataUrl ? (
            <img src={dataUrl} alt="QR Code" className="rounded-xl border border-slate-200 shadow-sm" style={{ width: 220, height: 220 }} />
          ) : (
            <div className="w-[220px] h-[220px] rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
              <QrCode className="w-12 h-12 text-slate-300" />
            </div>
          )}
          <p className="mt-3 text-sm font-semibold text-slate-800 text-center leading-tight">{activity.title}</p>
          {activity.date && (
            <p className="mt-0.5 text-xs text-slate-500 text-center">{activity.date}</p>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 break-all mb-4">{checkinUrl}</p>

        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={!dataUrl}
            className="flex-1 btn-primary text-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Telecharger
          </button>
          <button onClick={onClose} className="flex-1 btn-ghost border text-sm">
            Fermer
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Les participants scannent ce QR code pour s&apos;inscrire directement.
        </p>
      </div>
    </div>
  );
}

function ActivityCard({ activity, canEdit, onEdit, onDelete, onQrCode, onExport }) {
  const statusColors = {
    planned: "bg-blue-100 border-blue-200 text-blue-700",
    ongoing: "bg-orange-100 border-orange-200 text-orange-700",
    completed: "bg-green-100 border-green-200 text-green-700",
  };

  return (
    <div className="card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-semibold text-slate-900 text-lg">{activity.title}</p>
          <p className="text-sm text-slate-500 mt-1">
            {activity.partner} · {activity.device}
          </p>
          {activity.description && (
            <p className="text-sm text-slate-600 mt-2">{activity.description}</p>
          )}
          <p className="text-xs text-slate-400 mt-3 flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1">
              <MapPin size={14} />
              {activity.location}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {activity.date || "-"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4 lg:gap-6">
          <div className="text-center">
            {activity.participants > 0 ? (
              <>
                <p className="text-2xl font-bold text-slate-900 inline-flex items-center gap-1">
                  <Users className="h-5 w-5 text-orange-500" />
                  {activity.participants}
                </p>
                <p className="text-xs text-slate-500">Participants</p>
              </>
            ) : activity.participants_manual != null ? (
              <>
                <p className="text-2xl font-bold text-amber-600 inline-flex items-center gap-1" title="Nombre estime — liste non encore importee">
                  <Users className="h-5 w-5 text-amber-400" />
                  ~{activity.participants_manual}
                </p>
                <p className="text-xs text-amber-500">Estime</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-300 inline-flex items-center gap-1">
                  <Users className="h-5 w-5 text-slate-300" />
                  —
                </p>
                <p className="text-xs text-slate-400">Participants</p>
              </>
            )}
          </div>

          <span
            className={`badge ${
              statusColors[activity.status] || "bg-slate-100 border-slate-200 text-slate-700"
            }`}
          >
            {activity.statusLabel}
          </span>

          {activity.participants === 0 && (
            <span className="badge bg-amber-50 border-amber-200 text-amber-700" title="Aucune liste de presences importee">
              Sans liste
            </span>
          )}

          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-orange-600 hover:bg-orange-50"
              onClick={onQrCode}
              title="QR Code check-in"
            >
              <QrCode className="w-4 h-4" />
            </button>
            {activity.participants > 0 && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                onClick={onExport}
                title="Telecharger liste de presences"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {canEdit && (
              <>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                  onClick={onEdit}
                  title="Modifier"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50"
                  onClick={onDelete}
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
