import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  MapPin,
  Search,
  Filter,
  Pencil,
  Trash2,
  Users,
  Download,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  QrCode,
  X,
  FileText,
  Upload,
  Camera,
  ImageIcon,
  ZoomIn,
} from "lucide-react";
import QRCode from "qrcode";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { useAuth } from "../auth/useAuth";

export default function Activities({
  forceUploadOpen = false,
  initialSearchQuery = "",
}) {
  const { role, user, isViewer, isCoach } = useAuth();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;
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
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importDirectResult, setImportDirectResult] = useState(null);
  const [importDirectError, setImportDirectError] = useState("");
  const [importPreview, setImportPreview] = useState(null);   // données analyse
  const [importMapping, setImportMapping] = useState({});     // {original: field} overrides
  const [previewing, setPreviewing] = useState(false);

  const [editForm, setEditForm] = useState({
    id: null,
    title: "",
    description: "",
    activity_date: "",
    date_fin: "",
    duration_hours: "",
    location: "",
    device_id: "",
    partner_id: "",
    participants_manual: "",
    report_filename: null,
  });

  const [reportFile, setReportFile] = useState(null);
  const [reportUploading, setReportUploading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportSuccess, setReportSuccess] = useState(false);

  const [createReportFile, setCreateReportFile] = useState(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    activity_date: "",
    date_fin: "",
    duration_hours: "",
    location: "",
    device_id: "",
    partner_id: "",
    participants_manual: "",
    mode: "presentiel",
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
          title: a.title || "Activité sans titre",
          description: a.description || "",
          partner_id: a.partner_id || null,
          partner: a.partner_name || "-",
          device_id: a.device_id || null,
          device: a.device_name || "-",
          coach_id: a.coach_id || null,
          coach_name: a.coach_name || null,
          location: a.location || "-",
          date,
          duration_hours: a.duration_hours || "",
          participants: a.participants_count ?? 0,
          participants_manual: a.participants_manual ?? null,
          date_fin: a.date_fin ? String(a.date_fin).slice(0, 10) : null,
          report_filename: a.report_filename || null,
          photo_count: a.photo_count ?? 0,
          mode: a.mode || "presentiel",
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
      setError("Erreur de chargement des activités.");
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
    setCurrentPage(1);
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
      mode: "presentiel",
      file: null,
    });
    setUploadError("");
    setUploadResult(null);
    setImportStep(1);
    setCreateReportFile(null);
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
    setCreateReportFile(null);
  };

  const openEdit = (activity) => {
    setEditError("");
    setImportFile(null);
    setImporting(false);
    setImportDirectResult(null);
    setImportDirectError("");
    setReportFile(null);
    setReportError("");
    setReportSuccess(false);
    setEditForm({
      id: activity.id,
      title: activity.title || "",
      description: activity.description || "",
      activity_date: activity.date || "",
      date_fin: activity.date_fin || "",
      duration_hours: activity.duration_hours || "",
      location: activity.location === "-" ? "" : activity.location || "",
      device_id: activity.device_id || "",
      partner_id: activity.partner_id || "",
      participants_manual: activity.participants_manual ?? "",
      report_filename: activity.report_filename || null,
      mode: activity.mode || "presentiel",
    });
    setEditOpen(true);
  };

  const handleReportUpload = async () => {
    if (!reportFile || !editForm.id) return;
    setReportUploading(true);
    setReportError("");
    setReportSuccess(false);
    try {
      const fd = new FormData();
      fd.append("report", reportFile);
      await api.post(`/activities/${editForm.id}/report`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setReportSuccess(true);
      setEditForm(f => ({ ...f, report_filename: reportFile.name }));
      fetchActivities();
    } catch (err) {
      setReportError(err?.response?.data?.error || "Erreur lors de l'upload.");
    } finally {
      setReportUploading(false);
    }
  };

  const handlePreviewReport = (activityId) => {
    const base = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
    window.open(`${base}/activities/${activityId}/report?inline=1`, "_blank");
  };

  /* ===== GALERIE PHOTOS ===== */
  const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/$/, "");
  const [galleryActivity, setGalleryActivity] = useState(null);
  const [galleryPhotos, setGalleryPhotos] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [lightboxIdx, setLightboxIdx] = useState(null);

  const fetchPhotos = async (activityId) => {
    setGalleryLoading(true);
    setGalleryError("");
    try {
      const res = await api.get(`/activities/${activityId}/photos`);
      setGalleryPhotos(res.data);
    } catch {
      setGalleryError("Erreur lors du chargement des photos.");
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleOpenGallery = (activity) => {
    setGalleryActivity(activity);
    setGalleryPhotos([]);
    setLightboxIdx(null);
    setGalleryError("");
    fetchPhotos(activity.id);
  };

  const handleUploadPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !galleryActivity) return;
    setGalleryUploading(true);
    setGalleryError("");
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("photos", f));
      await api.post(`/activities/${galleryActivity.id}/photos`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchPhotos(galleryActivity.id);
      fetchActivities();
    } catch (err) {
      setGalleryError(err?.response?.data?.error || "Erreur lors de l'upload.");
    } finally {
      setGalleryUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!galleryActivity) return;
    try {
      await api.delete(`/activities/${galleryActivity.id}/photos/${photoId}`);
      const updated = galleryPhotos.filter(p => p.id !== photoId);
      setGalleryPhotos(updated);
      if (lightboxIdx !== null) {
        if (updated.length === 0) setLightboxIdx(null);
        else if (lightboxIdx >= updated.length) setLightboxIdx(updated.length - 1);
      }
      fetchActivities();
    } catch (err) {
      setGalleryError(err?.response?.data?.error || "Erreur suppression.");
    }
  };

  const handlePreview = async () => {
    if (!importFile) return;
    setPreviewing(true);
    setImportDirectError("");
    setImportPreview(null);
    setImportMapping({});
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await api.post("/import/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview(res.data);
    } catch (err) {
      setImportDirectError(err?.response?.data?.error || "Erreur lors de l'analyse.");
    } finally {
      setPreviewing(false);
    }
  };

  const handleDirectImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportDirectError("");
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      if (Object.keys(importMapping).length > 0)
        fd.append("manual_mapping", JSON.stringify(importMapping));
      const res = await api.post(`/import/direct/${editForm.id}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportDirectResult(res.data);
      setImportPreview(null);
      setImportMapping({});
      setEditForm(f => ({ ...f, participants_manual: "" }));
      fetchActivities();
    } catch (err) {
      setImportDirectError(err?.response?.data?.error || "Erreur lors de l'import.");
    } finally {
      setImporting(false);
    }
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
        date_fin: editForm.date_fin || null,
        duration_hours: editForm.duration_hours || null,
        location: editForm.location || null,
        device_id: editForm.device_id || null,
        mode: editForm.mode || "presentiel",
        participants_manual: editForm.participants_manual !== "" ? Number(editForm.participants_manual) : null,
      };
      if (role === "admin") payload.partner_id = editForm.partner_id || null;

      await api.put(`/activities/${editForm.id}`, payload);
      setEditOpen(false);
      fetchActivities();
    } catch (err) {
      setEditError(err.response?.data?.error || "Erreur mise à jour activité");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (activityId) => {
    if (!confirm("Supprimer cette activité définitivement ?")) return;
    setDeleteError("");
    try {
      await api.delete(`/activities/${activityId}`);
      fetchActivities();
    } catch (err) {
      setDeleteError(err.response?.data?.error || "Erreur suppression activité");
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
      alert("Erreur lors du téléchargement de la liste.");
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
        if (form.date_fin) fd.append("date_fin", form.date_fin);
        if (form.duration_hours) fd.append("duration_hours", form.duration_hours);
        fd.append("location", form.location);
        fd.append("mode", form.mode || "presentiel");
        if (role !== "coach") {
          if (form.device_id) fd.append("device_id", form.device_id);
          if (role === "admin" && form.partner_id) {
            fd.append("partner_id", form.partner_id);
          } else if (role === "partner" && user?.partner_id) {
            fd.append("partner_id", user.partner_id);
          }
        }
        if (form.participants_manual !== "") fd.append("participants_manual", form.participants_manual);
        fd.append("file", form.file);
        const res = await api.post("/import/activity", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (createReportFile && res.data?.activity?.id) {
          const rfd = new FormData();
          rfd.append("report", createReportFile);
          await api.post(`/activities/${res.data.activity.id}/report`, rfd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
        setUploadResult(res.data || {});
      } else {
        // Sans fichier → création simple
        const payload = {
          title: form.title,
          description: form.description,
          activity_date: form.activity_date,
          date_fin: form.date_fin || null,
          duration_hours: form.duration_hours || null,
          location: form.location || null,
          mode: form.mode || "presentiel",
          device_id: role !== "coach" ? (form.device_id || null) : null,
          participants_manual: form.participants_manual !== "" ? Number(form.participants_manual) : null,
          partner_id:
            role === "admin"
              ? form.partner_id || null
              : role === "partner"
              ? user?.partner_id || null
              : null,
        };
        const res = await api.post("/activities", payload);
        if (createReportFile && res.data?.id) {
          const rfd = new FormData();
          rfd.append("report", createReportFile);
          await api.post(`/activities/${res.data.id}/report`, rfd, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
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
      setUploadError(err.response?.data?.error || "Erreur création activité");
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
              Activités
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Gestion, import Excel et suivi des activités terrain.
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
        <CountCard label="Planifiées" value={stats.planned} />
        <CountCard label="En cours" value={stats.ongoing} />
        <CountCard label="Terminées" value={stats.completed} />
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
              placeholder="Rechercher une activité..."
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
            <option value="planned">Planifiée</option>
            <option value="ongoing">En cours</option>
            <option value="completed">Terminée</option>
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
          onDownloadReport={handlePreviewReport}
          onOpenGallery={handleOpenGallery}
          showQrCode={role !== "partner" && role !== "coach"}
        />
      ) : (() => {
        const totalPages = Math.ceil(filteredActivities.length / ITEMS_PER_PAGE);
        const paginated = filteredActivities.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
        return (
          <div className="space-y-4">
            {loading && <div className="card p-6 text-center text-slate-500">Chargement...</div>}
            {!loading && filteredActivities.length === 0 && (
              <div className="card p-6 text-center text-slate-500">Aucune activité trouvée</div>
            )}
            {paginated.map((activity) => (
              <ActivityCard
                key={activity.id}
                activity={activity}
                canEdit={!isViewer}
                onEdit={() => openEdit(activity)}
                onDelete={() => handleDelete(activity.id)}
                onQrCode={() => setQrActivity(activity)}
                onExport={() => handleExportActivity(activity)}
                onDownloadReport={() => handlePreviewReport(activity.id)}
                onOpenGallery={() => handleOpenGallery(activity)}
                showQrCode={role !== "partner" && role !== "coach"}
              />
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-slate-500">
                  {filteredActivities.length} activités — page {currentPage} / {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => { setCurrentPage(p => p - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" /> Précédent
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => { setCurrentPage(p => p + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                  >
                    Suivant <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {openUpload && (
        <ActivityModal
          title="Nouvelle activité"
          maxWidthClass="max-w-2xl"
          error={uploadError}
          onClose={closeUploadModal}
        >
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
              <div className="border-t border-slate-100 pt-4">
                <label className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  Rapport d'activité PDF
                  <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100"
                  onChange={(e) => setCreateReportFile(e.target.files?.[0] || null)}
                />
                {createReportFile && (
                  <p className="mt-1 text-xs text-emerald-600">
                    Rapport sélectionné : {createReportFile.name}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <label className="text-sm font-medium">Liste de presences Excel</label>
                    <span className="ml-2 text-xs text-slate-400">(optionnel — peut être ajouté plus tard)</span>
                  </div>
                  <a
                    href={`${import.meta.env.VITE_API_URL}/import/template`}
                    download="template_liste_presences.xlsx"
                    className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium"
                  >
                    <Download className="w-3 h-3" />
                    Télécharger le template
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
                    ? "Créer et importer la liste"
                    : "Créer l'activité"}
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
          title="Modifier activité"
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

          {/* Rapport d'activité */}
          <div className="mt-5 pt-5 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Rapport d'activité
            </p>
            {editForm.report_filename && (
              <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
                <span className="text-xs text-slate-600 flex-1 truncate">{editForm.report_filename}</span>
                <button
                  type="button"
                  onClick={() => handlePreviewReport(editForm.id)}
                  className="btn-ghost border text-xs flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Télécharger
                </button>
              </div>
            )}
            <div className="space-y-2">
              <input
                type="file"
                accept=".pdf"
                onChange={e => { setReportFile(e.target.files[0] || null); setReportError(""); setReportSuccess(false); }}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100"
              />
              {reportError && (
                <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{reportError}</p>
              )}
              {reportSuccess && (
                <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">Rapport uploadé avec succès.</p>
              )}
              <button
                type="button"
                disabled={!reportFile || reportUploading}
                onClick={handleReportUpload}
                className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {reportUploading ? "Upload en cours..." : "Uploader le rapport"}
              </button>
            </div>
          </div>

          {/* Import liste de présences */}
          <div className="mt-5 pt-5 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-700 mb-3">Importer la liste de présences Excel</p>

            {editForm.participants_manual !== "" && editForm.participants_manual !== null && !importDirectResult && (
              <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Estimation actuelle : <strong>{editForm.participants_manual} présences</strong>. L'import remplacera ce chiffre par le comptage réel.
              </div>
            )}

            {!importDirectResult ? (
              <div className="space-y-3">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => {
                    setImportFile(e.target.files[0] || null);
                    setImportDirectError("");
                    setImportPreview(null);
                    setImportMapping({});
                  }}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100"
                />
                {importDirectError && (
                  <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{importDirectError}</p>
                )}

                {/* Bouton Analyser */}
                {!importPreview && (
                  <button
                    type="button"
                    disabled={!importFile || previewing}
                    onClick={handlePreview}
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    {previewing ? "Analyse en cours..." : "Analyser le fichier"}
                  </button>
                )}

                {/* Prévisualisation du mapping */}
                {importPreview && (
                  <ImportPreviewPanel
                    preview={importPreview}
                    mapping={importMapping}
                    onMappingChange={setImportMapping}
                    onReset={() => { setImportPreview(null); setImportMapping({}); }}
                    onConfirm={handleDirectImport}
                    importing={importing}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 space-y-1">
                  <p className="font-semibold">Import réussi !</p>
                  <p>{importDirectResult.participants_importes} participant(s) importé(s) sur {importDirectResult.total_lignes} ligne(s)</p>
                  {importDirectResult.doublons_dans_activite > 0 && (
                    <p className="text-xs text-emerald-700">{importDirectResult.doublons_dans_activite} doublon(s) ignoré(s)</p>
                  )}
                  {importDirectResult.lignes_ignorees_nom_prenom_manquants > 0 && (
                    <p className="text-xs text-amber-700">{importDirectResult.lignes_ignorees_nom_prenom_manquants} ligne(s) ignorée(s) (nom/prénom manquant)</p>
                  )}
                </div>
                <ColumnMappingInfo result={importDirectResult} />
              </div>
            )}
          </div>

          {/* Photos */}
          <div className="mt-5 pt-5 border-t border-slate-200">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Camera className="w-4 h-4 text-slate-400" />
              Photos de l&apos;activité
              {(() => {
                const count = activities.find(a => a.id === editForm.id)?.photo_count ?? 0;
                return (
                  <span className={`text-xs font-normal rounded-full px-2 py-0.5 border ${count >= 8 ? "text-red-600 bg-red-50 border-red-200" : count > 0 ? "text-violet-600 bg-violet-50 border-violet-200" : "text-slate-400 bg-slate-50 border-slate-200"}`}>
                    {count}/8 photo{count !== 1 ? "s" : ""}
                  </span>
                );
              })()}
            </p>
            <button
              type="button"
              onClick={() => {
                const act = activities.find(a => a.id === editForm.id);
                if (act) handleOpenGallery(act);
              }}
              className="btn-secondary text-sm flex items-center gap-2 w-full justify-center"
            >
              <Camera className="w-4 h-4" />
              Voir / ajouter des photos
            </button>
          </div>
        </ActivityModal>
      )}

      {/* ===== GALERIE PHOTOS — PANNEAU LATÉRAL (portal → hors stacking context) ===== */}
      {galleryActivity && createPortal(
        <>
          {/* Fond sombre cliquable */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            style={{ zIndex: 9000 }}
            onClick={() => { setGalleryActivity(null); setLightboxIdx(null); }}
          />
          {/* Panneau latéral droit */}
          <div
            className="fixed right-0 top-0 h-full bg-white shadow-2xl flex flex-col w-full max-w-md"
            style={{ zIndex: 9001 }}
          >
            {/* En-tête */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 flex-shrink-0">
              <p className="font-semibold text-slate-800 text-sm flex items-center gap-2 min-w-0">
                <Camera className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <span className="truncate">{galleryActivity.title}</span>
                <span className={`text-xs font-normal rounded-full px-2 py-0.5 flex-shrink-0 border ${galleryPhotos.length >= 8 ? "text-red-600 bg-red-50 border-red-200" : "text-violet-600 bg-violet-50 border-violet-200"}`}>
                  {galleryPhotos.length}/8 photo{galleryPhotos.length > 1 ? "s" : ""}
                </span>
              </p>
              <button
                onClick={() => { setGalleryActivity(null); setLightboxIdx(null); }}
                className="ml-3 flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Zone upload */}
            {!isViewer && (
              <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
                {galleryPhotos.length >= 8 ? (
                  <div className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-red-200 bg-red-50 py-3 text-sm font-medium text-red-500">
                    <Camera className="w-4 h-4" />
                    Limite atteinte — 8 photos max par activité
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-violet-200 bg-violet-50 hover:bg-violet-100 hover:border-violet-400 transition-colors cursor-pointer py-3 text-sm font-medium text-violet-700 ${galleryUploading ? "opacity-60 pointer-events-none" : ""}`}>
                    <Camera className="w-4 h-4" />
                    {galleryUploading ? "Envoi en cours…" : `Ajouter des photos — ${8 - galleryPhotos.length} emplacement${8 - galleryPhotos.length > 1 ? "s" : ""} restant (3 Mo max)`}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadPhotos}
                      disabled={galleryUploading}
                    />
                  </label>
                )}
                {galleryError && (
                  <p className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{galleryError}</p>
                )}
              </div>
            )}

            {/* Grille de photos */}
            <div className="flex-1 overflow-y-auto p-4">
              {galleryLoading ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">Chargement…</div>
              ) : galleryPhotos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-slate-400 gap-2">
                  <ImageIcon className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Aucune photo pour le moment</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {galleryPhotos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 cursor-pointer hover:ring-2 hover:ring-violet-400 transition-all"
                      onClick={() => setLightboxIdx(idx)}
                    >
                      <img
                        src={`${API_URL}/activities/${galleryActivity.id}/photos/${photo.id}`}
                        alt={photo.filename}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <ZoomIn className="w-6 h-6 text-white drop-shadow" />
                      </div>
                      {(role === "admin" || photo.uploaded_by === user?.id) && !isViewer && (
                        <button
                          onClick={e => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                          className="absolute top-1 right-1 p-1 rounded-md bg-red-500 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}

      {/* ===== LIGHTBOX (portal → hors stacking context) ===== */}
      {galleryActivity && lightboxIdx !== null && galleryPhotos[lightboxIdx] && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/95"
          style={{ zIndex: 9999 }}
          onClick={() => setLightboxIdx(null)}
        >
          <img
            src={`${API_URL}/activities/${galleryActivity.id}/photos/${galleryPhotos[lightboxIdx].id}`}
            alt={galleryPhotos[lightboxIdx].filename}
            className="max-w-full max-h-full object-contain select-none"
            onClick={e => e.stopPropagation()}
            draggable={false}
          />
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
            {lightboxIdx + 1} / {galleryPhotos.length}
          </div>
          {lightboxIdx > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIdx(i => i - 1); }}
              className="absolute left-4 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          {lightboxIdx < galleryPhotos.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIdx(i => i + 1); }}
              className="absolute right-4 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
          <button
            onClick={() => setLightboxIdx(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>,
        document.body
      )}

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
          Activité créée avec succès.
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 text-sm">
          Aucune liste de présences importée. Vous pourrez l&apos;ajouter ultérieurement via le bouton &laquo;&nbsp;Modifier&nbsp;&raquo;.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
        Activité créée et liste importée avec succès.
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Lignes Excel" value={total} />
        <SummaryCard label="Importées" value={imported} />
        <SummaryCard label="Ignorées" value={ignored} />
        <SummaryCard label="Doublons" value={duplicates} />
      </div>
      <ColumnMappingInfo result={result} />
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

const FIELD_LABELS = {
  nom: "Nom", prenom: "Prénom", genre: "Genre", email: "Email",
  telephone: "Téléphone", structure: "Structure",
  tranche_age: "Tranche d'âge", statut: "Statut", nom_complet: "Nom complet",
};

function ImportPreviewPanel({ preview, mapping, onMappingChange, onReset, onConfirm, importing }) {
  const { columns = [], total_rows = 0, header_row = 1, available_fields = [] } = preview;

  const effectiveField = (col) => mapping[col.original] || col.field;

  const recognized = columns.filter(c => effectiveField(c));
  const unrecognized = columns.filter(c => !effectiveField(c));
  const hasName = recognized.some(c => ["nom", "prenom", "nom_complet"].includes(effectiveField(c)));

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
      {/* Résumé */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {total_rows} ligne{total_rows !== 1 ? "s" : ""} détectée{total_rows !== 1 ? "s" : ""}
          </p>
          {header_row > 1 && (
            <p className="text-xs text-amber-600 mt-0.5">En-tête détecté à la ligne {header_row}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Changer de fichier
        </button>
      </div>

      {/* Colonnes reconnues */}
      {recognized.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">
            ✓ Colonnes reconnues ({recognized.length})
          </p>
          <div className="space-y-1.5">
            {recognized.map(col => (
              <div key={col.original} className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                <span className="text-xs font-medium text-emerald-700 w-24 flex-shrink-0">
                  {FIELD_LABELS[effectiveField(col)] ?? effectiveField(col)}
                </span>
                <span className="text-xs text-slate-500">←</span>
                <span className="text-xs text-slate-700 font-mono">{col.original}</span>
                {col.samples.length > 0 && (
                  <span className="ml-auto text-xs text-slate-400 truncate max-w-[120px]">
                    ex : {col.samples[0]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Colonnes non reconnues → dropdown */}
      {unrecognized.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">
            Colonnes non reconnues — assigner manuellement
          </p>
          <div className="space-y-1.5">
            {unrecognized.map(col => (
              <div key={col.original} className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5">
                <span className="text-xs text-slate-700 font-mono flex-shrink-0 w-32 truncate">{col.original}</span>
                {col.samples.length > 0 && (
                  <span className="text-xs text-slate-400 truncate flex-1">ex : {col.samples[0]}</span>
                )}
                <select
                  className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
                  value={mapping[col.original] || ""}
                  onChange={e => {
                    const val = e.target.value;
                    onMappingChange(prev => {
                      const next = { ...prev };
                      if (val) next[col.original] = val;
                      else delete next[col.original];
                      return next;
                    });
                  }}
                >
                  <option value="">— Ignorer —</option>
                  {available_fields.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasName && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Aucune colonne nom/prénom détectée. Assignez au moins le nom et le prénom pour importer.
        </p>
      )}

      <button
        type="button"
        disabled={!hasName || importing}
        onClick={onConfirm}
        className="btn-primary text-sm w-full disabled:opacity-50"
      >
        {importing ? "Import en cours..." : `Confirmer l'import (${total_rows} lignes)`}
      </button>
    </div>
  );
}

function ColumnMappingInfo({ result }) {
  const recognized = result?.colonnes_reconnues ?? {};
  const unrecognized = result?.colonnes_non_reconnues ?? [];
  const headerRow = result?.ligne_entete_detectee;
  if (Object.keys(recognized).length === 0 && unrecognized.length === 0) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
      {headerRow > 1 && (
        <p className="text-amber-700 font-medium">En-tête détecté à la ligne {headerRow} (ligne(s) de titre ignorée(s))</p>
      )}
      {Object.keys(recognized).length > 0 && (
        <div>
          <p className="font-medium text-slate-600 mb-1">Colonnes reconnues :</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(recognized).map(([field, original]) => (
              <span key={field} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">
                <span className="font-medium">{FIELD_LABELS[field] ?? field}</span>
                {original !== (FIELD_LABELS[field] ?? field) && (
                  <span className="text-emerald-500">← {original}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      {unrecognized.length > 0 && (
        <div>
          <p className="font-medium text-slate-500 mb-1">Colonnes ignorées (non reconnues) :</p>
          <div className="flex flex-wrap gap-1.5">
            {unrecognized.map((col) => (
              <span key={col} className="rounded-full bg-slate-200 text-slate-500 px-2 py-0.5">{col}</span>
            ))}
          </div>
        </div>
      )}
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
        <label className="text-sm font-medium">Date de début *</label>
        <input
          type="date"
          required
          className="input mt-1"
          value={form.activity_date}
          onChange={(e) => setForm({ ...form, activity_date: e.target.value })}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Date de fin <span className="text-slate-400 font-normal text-xs">(optionnel — si activité multi-jours)</span></label>
        <input
          type="date"
          className="input mt-1"
          min={form.activity_date || undefined}
          value={form.date_fin || ""}
          onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
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
        <label className="text-sm font-medium">Nombre de présences (estimé)</label>
        <p className="text-xs text-slate-400 mb-1">Remplacement temporaire avant import Excel. Remplace automatiquement par le vrai compte une fois la liste importée.</p>
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
        <label className="text-sm font-medium">Mode</label>
        <select
          className="select mt-1"
          value={form.mode || "presentiel"}
          onChange={(e) => setForm({ ...form, mode: e.target.value })}
        >
          <option value="presentiel">Présentiel</option>
          <option value="ligne">En ligne</option>
        </select>
      </div>

      {(form.mode || "presentiel") === "presentiel" && (
        <div>
          <label className="text-sm font-medium">Lieu</label>
          <select
            className="select mt-1"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          >
            <option value="">Sélectionner une région</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>
      )}

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

      {role !== "coach" && (
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
      )}
    </>
  );
}

/* ── Calendrier ── */
const STATUS_COLORS = {
  planned: { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
  ongoing: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

function CalendarView({ activities, calendarDate, onDateChange, canEdit, onEdit, onDelete, onQrCode, onExport, onDownloadReport, onOpenGallery, showQrCode }) {
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
            Aujourd'hui
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
              {status === "planned" ? "Planifiée" : status === "ongoing" ? "En cours" : "Terminée"}
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
              {selectedActivities.length} activité{selectedActivities.length > 1 ? "s" : ""}
            </span>
          </p>
          {selectedActivities.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune activité ce jour.</p>
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
                  onDownloadReport={() => onDownloadReport && onDownloadReport(activity.id)}
                  onOpenGallery={() => onOpenGallery && onOpenGallery(activity)}
                  showQrCode={showQrCode}
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
  return createPortal(
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
        <div className="overflow-y-auto flex-1 min-h-0 px-6 pb-6">
          {error && (
            <div className="rounded-xl bg-red-50 text-red-700 px-4 py-3 mb-4">
              {error}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body
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

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="card-solid w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-orange-500 font-semibold">QR Code d'émargement</p>
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
    </div>,
    document.body
  );
}

function ActivityCard({ activity, canEdit, onEdit, onDelete, onQrCode, onExport, onDownloadReport, onOpenGallery, showQrCode = true }) {
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
            {activity.coach_name
              ? `Formateur : ${activity.coach_name}`
              : `${activity.partner} · ${activity.device}`
            }
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
              {activity.date_fin && activity.date_fin !== activity.date
                ? `Du ${activity.date} au ${activity.date_fin}`
                : activity.date || "-"}
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

          {activity.report_filename ? (
            <span className="badge bg-emerald-50 border-emerald-200 text-emerald-700" title={`Rapport : ${activity.report_filename}`}>
              Rapport ✓
            </span>
          ) : (
            <span className="badge bg-slate-100 border-slate-200 text-slate-400">
              Sans rapport
            </span>
          )}

          {activity.participants === 0 && (
            <span className="badge bg-amber-50 border-amber-200 text-amber-700" title="Aucune liste de présences importée">
              Sans liste
            </span>
          )}

          {activity.photo_count > 0 && (
            <button
              onClick={onOpenGallery}
              className="badge bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 transition-colors cursor-pointer flex items-center gap-1"
              title={`${activity.photo_count} photo${activity.photo_count > 1 ? "s" : ""}`}
            >
              <Camera className="w-3 h-3" />
              {activity.photo_count} photo{activity.photo_count > 1 ? "s" : ""}
            </button>
          )}

          <div className="flex items-center gap-2">
            {showQrCode && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-orange-600 hover:bg-orange-50"
                onClick={onQrCode}
                title="QR Code d'émargement"
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}
            {onOpenGallery && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-violet-600 hover:bg-violet-50"
                onClick={onOpenGallery}
                title="Photos de l'activité"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
            {activity.participants > 0 && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                onClick={onExport}
                title="Télécharger liste de présences"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {activity.report_filename && onDownloadReport && (
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                onClick={onDownloadReport}
                title={`Rapport : ${activity.report_filename}`}
              >
                <FileText className="w-4 h-4" />
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
