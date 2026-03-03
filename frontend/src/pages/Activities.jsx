import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  MapPin,
  Upload,
  Search,
  Filter,
  Pencil,
  Trash2,
  Users,
  FileSpreadsheet,
  ScanSearch,
  Link2,
  CheckCircle2,
} from "lucide-react";
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
  const [editForm, setEditForm] = useState({
    id: null,
    title: "",
    description: "",
    activity_date: "",
    duration_hours: "",
    location: "",
    device_id: "",
    partner_id: "",
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    activity_date: "",
    duration_hours: "",
    location: "",
    device_id: "",
    partner_id: "",
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

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError("");
    setUploadResult(null);
    setImportStep(2);
    setUploading(true);
    try {
      if (!form.file) {
        setUploadError("Fichier Excel requis");
        setImportStep(1);
        return;
      }

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
      fd.append("file", form.file);

      const res = await api.post("/import/activity", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setUploadResult(res.data || {});
      setImportStep(4);
      fetchActivities();
    } catch (err) {
      setUploadError(err.response?.data?.error || "Erreur import Excel");
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

          {!isViewer && (
            <button className="btn-primary" onClick={openUploadModal}>
              <Upload size={18} />
              Nouvelle activite
            </button>
          )}
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

      <div className="space-y-4">
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
          />
        ))}
      </div>

      {openUpload && (
        <ActivityModal
          title="Importer activite (Excel)"
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
                <label className="text-sm font-medium">Fichier Excel *</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  required
                  className="mt-1"
                  onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeUploadModal} className="btn-ghost border">
                  Annuler
                </button>
                <button type="submit" disabled={uploading} className="btn-primary disabled:opacity-60">
                  {uploading ? "Import..." : "Valider l import"}
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
                Importer un autre fichier
              </button>
              <button type="button" className="btn-primary" onClick={closeUploadModal}>
                Terminer
              </button>
            </div>
          )}
        </ActivityModal>
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

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
        Import termine avec succes.
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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className={`card-solid w-full ${maxWidthClass} p-6`}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost border">
            Fermer
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

function ActivityCard({ activity, canEdit, onEdit, onDelete }) {
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
            <p className="text-2xl font-bold text-slate-900 inline-flex items-center gap-1">
              <Users className="h-5 w-5 text-orange-500" />
              {activity.participants}
            </p>
            <p className="text-xs text-slate-500">Participants</p>
          </div>

          <span
            className={`badge ${
              statusColors[activity.status] || "bg-slate-100 border-slate-200 text-slate-700"
            }`}
          >
            {activity.statusLabel}
          </span>

          {canEdit && (
            <div className="flex items-center gap-2">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
