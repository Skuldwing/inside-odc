import { useEffect, useMemo, useState } from "react";
import { Calendar, MapPin, Upload } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";

export default function Activities() {
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
      const today = new Date();
      const mapped = res.data.map((a) => {
        const activityDate = a.activity_date
          ? new Date(a.activity_date)
          : null;
        let computedStatus = "planned";
        if (activityDate) {
          const isSameDay =
            activityDate.toISOString().slice(0, 10) ===
            today.toISOString().slice(0, 10);
          if (activityDate < today) computedStatus = "completed";
          else if (isSameDay) computedStatus = "ongoing";
        }

        const statusValue = a.status || computedStatus;

        return {
          id: a.id,
          title: a.title,
          partner_id: a.partner_id || null,
          partner: a.partner_name || "-",
          device_id: a.device_id || null,
          device: a.device_name || "-",
          location: a.location || "-",
          date: a.activity_date,
          participants: a.participants_count ?? 0,
          status: statusValue,
          statusLabel:
            statusValue === "completed"
              ? "Terminée"
              : statusValue === "ongoing"
              ? "En cours"
              : "Planifiée",
        };
      });
      setActivities(mapped);
    } catch {
      setError("Erreur chargement activités");
    } finally {
      setLoading(false);
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await api.get("/devices");
      setDevices(res.data);
    } catch {
      setDevices([]);
    }
  };

  const fetchPartners = async () => {
    try {
      const res = await api.get("/partners");
      setPartners(res.data);
    } catch {
      setPartners([]);
    }
  };

  useEffect(() => {
    fetchActivities();
    if (role === "admin") {
      fetchDevices();
      fetchPartners();
    }
  }, [role]);

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

  const filteredActivities = activities.filter((a) => {
    if (role === "admin" && partnerFilter) {
      if (String(a.partner_id) !== String(partnerFilter)) return false;
    }
    if (deviceFilter) {
      if (String(a.device_id || "") !== String(deviceFilter)) return false;
    }
    if (status !== "all" && a.status !== status) return false;
    if (
      search &&
      !a.title.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

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
      if (role === "admin") {
        payload.partner_id = editForm.partner_id || null;
      }

      await api.put(`/activities/${editForm.id}`, payload);
      setEditOpen(false);
      fetchActivities();
    } catch (err) {
      setEditError(
        err.response?.data?.error || "Erreur mise a jour activite"
      );
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
      setDeleteError(
        err.response?.data?.error || "Erreur suppression activite"
      );
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError("");
    setUploading(true);
    try {
      if (!form.file) {
        setUploadError("Fichier Excel requis");
        return;
      }

      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("description", form.description);
      fd.append("activity_date", form.activity_date);
      if (form.duration_hours) {
        fd.append("duration_hours", form.duration_hours);
      }
      fd.append("location", form.location);
      if (form.device_id) fd.append("device_id", form.device_id);
      if (role === "admin" && form.partner_id) {
        fd.append("partner_id", form.partner_id);
      } else if (role === "partner" && user?.partner_id) {
        fd.append("partner_id", user.partner_id);
      }
      fd.append("file", form.file);

      await api.post("/import/activity", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setOpenUpload(false);
      resetForm();
      fetchActivities();
    } catch (err) {
      setUploadError(
        err.response?.data?.error || "Erreur import Excel"
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Activités</h1>
          <p className="page-subtitle">
            Gestion et suivi des activités Orange Digital Center
          </p>
        </div>

        {!isViewer && (
          <button
            className="btn-primary"
            onClick={() => {
              resetForm();
              setOpenUpload(true);
            }}
          >
            <Upload size={18} />
            Nouvelle activité
          </button>
        )}
      </div>

      <div className="card p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          type="text"
          placeholder="Rechercher une activité..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />

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

        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Tous les statuts</option>
          <option value="planned">Planifiée</option>
          <option value="ongoing">En cours</option>
          <option value="completed">Terminée</option>
        </select>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3">
            {error}
          </div>
        )}
        {deleteError && (
          <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3">
            {deleteError}
          </div>
        )}
        {loading && (
          <div className="card p-6 text-center text-slate-500">
            Chargement...
          </div>
        )}
        {!loading && filteredActivities.length === 0 && (
          <div className="card p-6 text-center text-slate-500">
            Aucune activité trouvée
          </div>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card-solid w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              Importer activité (Excel)
            </h2>

            {uploadError && (
              <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 mb-4">
                {uploadError}
              </div>
            )}

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Intitulé *</label>
                <input
                  required
                  className="input mt-1"
                  value={form.title}
                  onChange={(e) =>
                    setForm({ ...form, title: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Date *</label>
                <input
                  type="date"
                  required
                  className="input mt-1"
                  value={form.activity_date}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      activity_date: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Durée (heures)</label>
                <input
                  type="number"
                  min="0"
                  className="input mt-1"
                  value={form.duration_hours}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      duration_hours: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Lieu</label>
                <select
                  className="select mt-1"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                >
                  <option value="">Sélectionner une région</option>
                  {senegalRegions.map((region) => (
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
                    onChange={(e) =>
                      setForm({
                        ...form,
                        partner_id: e.target.value,
                      })
                    }
                  >
                    <option value="">Sélectionner</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {role === "admin" && (
                <div>
                  <label className="text-sm font-medium">Dispositif</label>
                  <select
                    className="select mt-1"
                    value={form.device_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        device_id: e.target.value,
                      })
                    }
                  >
                    <option value="">Sélectionner</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Fichier Excel *</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  required
                  className="mt-1"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      file: e.target.files?.[0] || null,
                    })
                  }
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setOpenUpload(false)}
                  className="btn-ghost border"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn-primary disabled:opacity-60"
                >
                  {uploading ? "Import..." : "Importer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card-solid w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              Modifier activite
            </h2>

            {editError && (
              <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 mb-4">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Intitule *</label>
                <input
                  required
                  className="input mt-1"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm({ ...editForm, title: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Date *</label>
                <input
                  type="date"
                  required
                  className="input mt-1"
                  value={editForm.activity_date}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      activity_date: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Duree (heures)</label>
                <input
                  type="number"
                  min="0"
                  className="input mt-1"
                  value={editForm.duration_hours}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      duration_hours: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Lieu</label>
                <select
                  className="select mt-1"
                  value={editForm.location}
                  onChange={(e) =>
                    setEditForm({ ...editForm, location: e.target.value })
                  }
                >
                  <option value="">Selectionner une region</option>
                  {senegalRegions.map((region) => (
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
                    value={editForm.partner_id}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        partner_id: e.target.value,
                      })
                    }
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

              {role === "admin" && (
                <div>
                  <label className="text-sm font-medium">Dispositif</label>
                  <select
                    className="select mt-1"
                    value={editForm.device_id}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        device_id: e.target.value,
                      })
                    }
                  >
                    <option value="">Selectionner</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="btn-ghost border"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="btn-primary disabled:opacity-60"
                >
                  {editSaving ? "Sauvegarde..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityCard({ activity, canEdit, onEdit, onDelete }) {
  const statusColors = {
    planned: "bg-blue-100 text-blue-700",
    ongoing: "bg-orange-100 text-orange-700",
    completed: "bg-green-100 text-green-700",
  };

  return (
    <div className="card p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 hover:shadow-xl transition">
      <div>
        <p className="font-semibold text-slate-900 text-lg">
          {activity.title}
        </p>
        <p className="text-sm text-slate-500">
          {activity.partner} • {activity.device}
        </p>
        <p className="text-xs text-slate-400 mt-2 flex items-center gap-4">
          <span className="flex items-center gap-1">
            <MapPin size={14} />
            {activity.location}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={14} />
            {activity.date}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-8">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">
            {activity.participants}
          </p>
          <p className="text-xs text-slate-500">Participants</p>
        </div>

        <span
          className={`badge ${statusColors[activity.status]}`}
        >
          {activity.statusLabel}
        </span>

        {canEdit && (
          <div className="flex items-center gap-3">
            <button
              className="text-orange-600 hover:underline text-sm font-medium"
              onClick={onEdit}
            >
              Modifier
            </button>
            <button
              className="text-red-600 hover:underline text-sm font-medium"
              onClick={onDelete}
            >
              Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
