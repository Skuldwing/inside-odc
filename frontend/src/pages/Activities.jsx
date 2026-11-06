import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  AlertTriangle,
  ScanSearch,
  Check,
  Loader2,
  Eye,
  Layers,
  ArrowRight,
  Clock,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Paperclip,
} from "lucide-react";
import QRCode from "qrcode";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import {
  useToast,
  useConfirm,
  EmptyState,
} from "../components/ui";
import { useAuth } from "../auth/useAuth";

export default function Activities({
  forceUploadOpen = false,
  initialSearchQuery: initialSearchQueryProp = "",
}) {
  const { role, user, isViewer, isCoach } = useAuth();
  const navigate = useNavigate();

  /* La recherche pouvait arriver par l'URL : c'est OperationsHub qui lisait
     le parametre et le passait en propriete. Cette page etant desormais
     montee directement, elle le lit elle-meme. */
  const [searchParams] = useSearchParams();
  const initialSearchQuery =
    initialSearchQueryProp || searchParams.get("q") || "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const listGap = "gap-2";
  const cardPadding = "p-3";
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [activities, setActivities] = useState([]);
  const [devices, setDevices] = useState([]);
  const [partners, setPartners] = useState([]);
  const [coaches, setCoaches] = useState([]);
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
  const [viewMode, setViewMode] = useState("sections");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [qrActivity, setQrActivity] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importDirectResult, setImportDirectResult] = useState(null);
  const [importDirectError, setImportDirectError] = useState("");
  const [importPreview, setImportPreview] = useState(null); // données analyse
  /* Le compte rendu de la simulation : ce que l'import produira réellement,
     obtenu en le rejouant puis en l'annulant côté serveur. */
  const [importSimulation, setImportSimulation] = useState(null);
  /* « Garder la liste telle quelle » : une ligne, une inscription. C'est le
     responsable qui était en salle qui le demande — il sait ce qu'aucune
     règle ne peut deviner. L'activité passe alors sous réserve, et un
     administrateur tranche après coup. */
  const [importTelleQuelle, setImportTelleQuelle] = useState(false);
  /* « Enregistrer » a sauvé les champs, mais la liste attend encore une
     confirmation. Sans ce mot, la fiche qui reste ouverte passerait pour un
     bouton qui n'a pas marché. */
  const [listeEnAttente, setListeEnAttente] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [importMapping, setImportMapping] = useState({}); // {original: field} overrides
  const [previewing, setPreviewing] = useState(false);
  const [createImportPreview, setCreateImportPreview] = useState(null);
  const [createImportMapping, setCreateImportMapping] = useState({});
  const [createPreviewing, setCreatePreviewing] = useState(false);
  const [createPreviewError, setCreatePreviewError] = useState("");

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
  const [reportError, setReportError] = useState("");
  const [reportDeleting, setReportDeleting] = useState(false);
  const [editReportType, setEditReportType] = useState("rapport_synthese");
  const [generatingEditReport, setGeneratingEditReport] = useState(false);
  const [editReferenceFile, setEditReferenceFile] = useState(null);

  /* ===== CHECKLIST DANS LE FORMULAIRE =====
     Deux usages : en création, un brouillon local qui sera persisté après
     l'enregistrement de l'activité. En édition, les tâches existantes
     chargées depuis l'API et modifiables en temps réel. */
  const [teamMembers, setTeamMembers] = useState([]);
  const [createChecklist, setCreateChecklist] = useState([]);
  const [editTasks, setEditTasks] = useState([]);
  const [editTasksLoading, setEditTasksLoading] = useState(false);

  const [createReportFile, setCreateReportFile] = useState(null);
  /* Génération de rapport : l'utilisateur peut choisir un type de rapport
     à générer automatiquement après la création de l'activité. */
  const CREATE_REPORT_TYPES = [
    { value: "", label: "Aucun", desc: "Ne pas générer de rapport" },
    { value: "rapport_synthese", label: "Rapport synthétique", desc: "Rapport détaillé en quatre pages avec les informations et chiffres clés de l'activité" },
    { value: "liste_presence", label: "Liste de présence", desc: "Liste formatée avec tel, email et signature" },
  ];
  const [createReportType, setCreateReportType] = useState("");
  const [createReferenceFile, setCreateReferenceFile] = useState(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    activity_date: "",
    date_fin: "",
    duration_hours: "",
    location: "",
    device_id: "",
    partner_id: "",
    coach_id: "",
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
        const date = a.activity_date
          ? String(a.activity_date).slice(0, 10)
          : "";
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
          /* Lignes de liste de présence d'un côté, personnes distinctes de
             l'autre. Les deux comptent, et un seul chiffre ne pouvait pas
             porter les deux sens. */
          personnes_distinctes: a.personnes_distinctes ?? null,
          participants_manual: a.participants_manual ?? null,
          date_fin: a.date_fin ? String(a.date_fin).slice(0, 10) : null,
          report_filename: a.report_filename || null,
          photo_count: a.photo_count ?? 0,
          /* La page reconstruit chaque activité champ par champ : ce qui n'est
             pas recopié ici n'existe pas pour les cartes, quoi que renvoie
             l'API. */
          emargement_actif: a.emargement_actif !== false,
          /* La liste est-elle entrée telle qu'elle a été écrite, et quelqu'un
             l'a-t-il regardée depuis ? Un effectif sous réserve doit se voir
             sur la carte : sinon il finit dans un rapport comme s'il était
             sûr. */
          liste_telle_quelle: a.liste_telle_quelle === true,
          liste_validee_le: a.liste_validee_le || null,
          liste_validee_par: a.liste_validee_par_nom || null,
          rapprochements_en_attente: a.rapprochements_en_attente ?? 0,
          mode: a.mode || "presentiel",
          reliability_score:
            a.reliability_score != null ? Number(a.reliability_score) : null,
          reliability_status: a.reliability_status || null,
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

  /* Liste des coachs pour le selecteur du formulaire. Reservee aux admins :
     eux seuls peuvent confier une activite a quelqu'un. */
  const fetchCoaches = async () => {
    try {
      const res = await api.get("/users/coaches");
      setCoaches(res.data || []);
    } catch {
      setCoaches([]);
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

  /* Membres de l'équipe pour le champ responsable de la checklist. */
  const fetchTeamMembers = async () => {
    try {
      const res = await api.get("/activities/team-members");
      setTeamMembers(res.data || []);
    } catch {
      setTeamMembers([]);
    }
  };

  useEffect(() => {
    fetchActivities();
    fetchDevices();
    if (role === "admin") {
      fetchPartners();
      fetchCoaches();
    }
    if (!isViewer) {
      fetchTeamMembers();
    }
  }, [role, isViewer]);

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
  const totalPages = Math.ceil(filteredActivities.length / ITEMS_PER_PAGE);
  const sectionPageActivities = filteredActivities.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activities, role, partnerFilter, deviceFilter, status, search, viewMode]);

  /* La vue « Par section » affiche chaque activité sous forme de rectangle
     (grille de cartes), par opposition à la liste complète qui aligne des
     lignes larges. Les deux montrent les mêmes activités filtrées. */
  const stats = useMemo(() => {
    const total = filteredActivities.length;
    const planned = filteredActivities.filter(
      (a) => a.status === "planned",
    ).length;
    const ongoing = filteredActivities.filter(
      (a) => a.status === "ongoing",
    ).length;
    const completed = filteredActivities.filter(
      (a) => a.status === "completed",
    ).length;
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
      coach_id: "",
      participants_manual: "",
      mode: "presentiel",
      file: null,
    });
    setUploadError("");
    setUploadResult(null);
    setImportStep(1);
    setCreateReportFile(null);
    setCreateReportType("");
    setCreateReferenceFile(null);
    setCreateImportPreview(null);
    setCreateImportMapping({});
    setCreatePreviewError("");
    setCreateChecklist([]);
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
    setCreateReportType("");
    setCreateReferenceFile(null);
    setCreateImportPreview(null);
    setCreateImportMapping({});
    setCreatePreviewError("");
    setCreateChecklist([]);
  };

  const openEdit = (activity) => {
    setEditError("");
    setImportFile(null);
    setImporting(false);
    setImportDirectResult(null);
    setImportDirectError("");
    setListeEnAttente(false);
    setImportTelleQuelle(false);
    setReportFile(null);
    setReportError("");
    setClearParticipantsConfirm(false);
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
      coach_id: activity.coach_id || "",
      participants: activity.participants || 0,
      participants_manual: activity.participants_manual ?? "",
      report_filename: activity.report_filename || null,
      mode: activity.mode || "presentiel",
    });
    /* Charger les tâches existantes pour la checklist en édition. */
    setEditTasks([]);
    setEditTasksLoading(true);
    api
      .get(`/activities/${activity.id}/tasks`)
      .then((r) => setEditTasks(r.data || []))
      .catch(() => setEditTasks([]))
      .finally(() => setEditTasksLoading(false));
    setEditOpen(true);
  };

  const handlePreviewReport = (activityId) => {
    const base = (
      import.meta.env.VITE_API_URL || "http://localhost:3000"
    ).replace(/\/$/, "");
    window.open(`${base}/activities/${activityId}/report?inline=1`, "_blank");
  };

  const handleDeleteReport = async () => {
    if (!editForm?.id) return;
    const ok = await confirm({
      title: "Supprimer le rapport ?",
      body: "Vous pourrez en téléverser un autre ensuite.",
      destructive: true,
    });
    if (!ok) return;
    setReportDeleting(true);
    setReportError("");
    try {
      await api.delete(`/activities/${editForm.id}/report`);
      setEditForm((f) => ({ ...f, report_filename: null }));
      setReportFile(null);
      fetchActivities();
    } catch (err) {
      setReportError(
        err?.response?.data?.error || "Erreur lors de la suppression.",
      );
    } finally {
      setReportDeleting(false);
    }
  };

  /* Génère un rapport PDF depuis les données de l'activité en édition. */
  const handleGenerateEditReport = async () => {
    if (!editForm?.id) return;
    setGeneratingEditReport(true);
    setReportError("");
    try {
      const formData = new FormData();
      formData.append("report_type", editReportType);
      if (editReferenceFile) {
        formData.append("reference", editReferenceFile);
      }
      const res = await api.post(
        `/activities/${editForm.id}/generate-report`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setEditForm((f) => ({
        ...f,
        report_filename: res.data?.filename || f.report_filename,
      }));
      setEditReferenceFile(null);
      fetchActivities();
    } catch (err) {
      setReportError(
        err?.response?.data?.error || "Erreur lors de la génération du rapport.",
      );
    } finally {
      setGeneratingEditReport(false);
    }
  };

  /* ===== SUPPRESSION LISTE PARTICIPANTS ===== */
  const [clearingParticipants, setClearingParticipants] = useState(false);
  const [clearParticipantsConfirm, setClearParticipantsConfirm] =
    useState(false);

  const handleClearParticipants = async () => {
    if (!editForm?.id) return;
    setClearingParticipants(true);
    try {
      await api.delete(`/activities/${editForm.id}/participants`);
      setEditForm((f) => ({
        ...f,
        participants: 0,
        participants_manual: null,
      }));
      setImportDirectResult(null);
      setImportFile(null);
      setImportPreview(null);
      setImportSimulation(null);
      setClearParticipantsConfirm(false);
      fetchActivities();
    } catch (err) {
      toast.error(err?.response?.data?.error || "La suppression a échoué.");
    } finally {
      setClearingParticipants(false);
    }
  };

  /* ===== GALERIE PHOTOS ===== */
  const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
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
      files.forEach((f) => fd.append("photos", f));
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
      const updated = galleryPhotos.filter((p) => p.id !== photoId);
      setGalleryPhotos(updated);
      if (lightboxIdx !== null) {
        if (updated.length === 0) setLightboxIdx(null);
        else if (lightboxIdx >= updated.length)
          setLightboxIdx(updated.length - 1);
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
    setImportSimulation(null);
    setImportMapping({});
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await api.post("/import/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview(res.data);
    } catch (err) {
      setImportDirectError(
        err?.response?.data?.error || "Erreur lors de l'analyse.",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const handleCreatePreview = async () => {
    if (!form.file) return;
    setCreatePreviewing(true);
    setCreatePreviewError("");
    setCreateImportPreview(null);
    setCreateImportMapping({});
    try {
      const fd = new FormData();
      fd.append("file", form.file);
      const res = await api.post("/import/preview", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCreateImportPreview(res.data);
    } catch (err) {
      setCreatePreviewError(
        err?.response?.data?.error || "Erreur lors de l'analyse.",
      );
    } finally {
      setCreatePreviewing(false);
    }
  };

  /* Ce que le fichier fera, avant qu'il le fasse.
     Le nombre de lignes ne dit rien : une liste déjà importée en a autant et
     n'ajoute personne. Le serveur rejoue l'import pour de vrai puis annule
     tout, et renvoie le compte exact. */
  const envoyerImport = async (simulation) => {
    const fd = new FormData();
    fd.append("file", importFile);
    if (Object.keys(importMapping).length > 0)
      fd.append("manual_mapping", JSON.stringify(importMapping));
    if (simulation) fd.append("simulation", "1");
    if (importTelleQuelle) fd.append("telle_quelle", "1");
    const res = await api.post(`/import/direct/${editForm.id}`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  };

  const basculerTelleQuelle = (valeur) => {
    setImportTelleQuelle(valeur);
    /* Le compte rendu affiché ne vaut plus : il décrit l'autre mode. Le
       laisser à l'écran ferait cliquer « Importer » sur un diagnostic
       périmé. */
    setImportSimulation(null);
  };

  const handleSimuler = async () => {
    if (!importFile) return;
    setSimulating(true);
    setImportDirectError("");
    try {
      setImportSimulation(await envoyerImport(true));
    } catch (err) {
      setImportDirectError(
        err?.response?.data?.error || "La vérification a échoué.",
      );
    } finally {
      setSimulating(false);
    }
  };

  const handleDirectImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportDirectError("");
    try {
      const data = await envoyerImport(false);
      setImportDirectResult(data);
      setImportPreview(null);
      setImportSimulation(null);
      setImportMapping({});
      setListeEnAttente(false);
      setEditForm((f) => ({ ...f, participants_manual: "" }));
      fetchActivities();
    } catch (err) {
      setImportDirectError(
        err?.response?.data?.error || "Erreur lors de l'import.",
      );
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
        participants_manual:
          editForm.participants_manual !== ""
            ? Number(editForm.participants_manual)
            : null,
      };
      if (role === "admin") {
        payload.partner_id = editForm.partner_id || null;
        payload.coach_id = editForm.coach_id || null;
      }

      await api.put(`/activities/${editForm.id}`, payload);

      /* Le rapport voyage sur une route separee (multipart), mais il fait
         partie de ce que l'utilisateur vient de remplir : l'envoyer ici evite
         le piege d'un fichier choisi puis perdu parce qu'un second bouton
         n'avait pas ete actionne. */
      if (reportFile) {
        setReportError("");
        const fd = new FormData();
        fd.append("report", reportFile);
        await api.post(`/activities/${editForm.id}/report`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setReportFile(null);
      }

      /* La liste de présences choisie mais pas encore importée.
       *
       * Le rapport PDF est envoyé ici depuis longtemps, précisément pour
       * éviter « un fichier choisi puis perdu parce qu'un second bouton
       * n'avait pas été actionné ». La liste, elle, ne l'était pas : on
       * enregistrait les champs, on fermait la fiche, et le fichier — avec
       * l'option « garder la liste telle quelle » qu'on venait de cocher —
       * disparaissait sans un mot. L'activité ne se mettait pas à jour, et
       * rien ne disait pourquoi.
       *
       * On ne l'importe pas en silence pour autant : une liste qui entre sans
       * qu'on ait vu ce qu'elle fait, c'est exactement ce que la simulation
       * sert à empêcher. On la joue donc — rien n'est écrit —, on garde la
       * fiche ouverte, et il ne reste qu'à confirmer. */
      if (importFile && !importDirectResult) {
        setListeEnAttente(true);
        setImportDirectError("");
        try {
          setImportSimulation(await envoyerImport(true));
        } catch (err) {
          setImportDirectError(
            err?.response?.data?.error || "La vérification a échoué.",
          );
        }
        fetchActivities();
        return;
      }

      setEditOpen(false);
      fetchActivities();
    } catch (err) {
      setEditError(err.response?.data?.error || "Erreur mise à jour activité");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (activityId) => {
    const ok = await confirm({
      title: "Supprimer cette activité ?",
      body: "La liste de présences et le rapport associés seront supprimés avec elle.",
      destructive: true,
    });
    if (!ok) return;
    setDeleteError("");
    try {
      await api.delete(`/activities/${activityId}`);
      fetchActivities();
    } catch (err) {
      setDeleteError(
        err.response?.data?.error || "Erreur suppression activité",
      );
    }
  };

  const handleExportActivity = async (activity) => {
    try {
      const res = await api.get(
        `/activities/${activity.id}/participants/export`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `presences_${activity.id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Le téléchargement de la liste a échoué.");
    }
  };

  /* Les tâches saisies dans le formulaire de création n'ont pas encore
     d'activité : elles sont créées une fois l'activité enregistrée. Un échec
     ici ne remet pas en cause la création de l'activité. */
  const persistChecklist = async (activityId) => {
    if (!activityId || createChecklist.length === 0) return;
    try {
      await Promise.all(
        createChecklist.map((t) =>
          api.post(`/activities/${activityId}/tasks`, {
            title: t.title,
            assigned_to: t.assigned_to ?? null,
            due_date: t.due_date || null,
            status: t.status || "a_faire",
          }),
        ),
      );
    } catch {
      /* Silencieux : l'activité est créée, les tâches pourront être
         ajoutées depuis la fiche détail. */
    }
    setCreateChecklist([]);
  };

  /* Génère un rapport PDF automatiquement après la création de l'activité,
     si l'utilisateur a sélectionné un type de rapport dans le formulaire. */
  const persistGeneratedReport = async (activityId) => {
    if (!activityId || !createReportType) return;
    try {
      const formData = new FormData();
      formData.append("report_type", createReportType);
      if (createReferenceFile) {
        formData.append("reference", createReferenceFile);
      }
      await api.post(`/activities/${activityId}/generate-report`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    } catch {
      /* Silencieux : l'activité est créée, le rapport pourra être généré
         depuis la fiche détail. */
    }
    setCreateReportType("");
    setCreateReferenceFile(null);
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
        if (form.duration_hours)
          fd.append("duration_hours", form.duration_hours);
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
        if (form.participants_manual !== "")
          fd.append("participants_manual", form.participants_manual);
        fd.append("file", form.file);
        if (Object.keys(createImportMapping).length > 0) {
          fd.append("manual_mapping", JSON.stringify(createImportMapping));
        }
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
        await persistChecklist(res.data?.activity?.id);
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
          device_id: form.device_id || null,
          coach_id: role === "admin" ? form.coach_id || null : null,
          participants_manual:
            form.participants_manual !== ""
              ? Number(form.participants_manual)
              : null,
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
        await persistChecklist(res.data?.id);
        await persistGeneratedReport(res.data?.id);
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

  /* Resume des filtres actifs : on doit savoir ce qu'on regarde sans deplier. */
  const STATUS_LABELS = {
    planned: "Planifiée",
    ongoing: "En cours",
    completed: "Terminée",
  };

  const activeFilterChips = [];
  if (role === "admin" && partnerFilter) {
    activeFilterChips.push({
      key: "partner",
      label: "Partenaire",
      value:
        partners.find((p) => String(p.id) === String(partnerFilter))?.name ||
        "—",
      clear: () => setPartnerFilter(""),
    });
  }
  if (deviceFilter) {
    activeFilterChips.push({
      key: "device",
      label: "Dispositif",
      value:
        deviceOptions.find((d) => String(d.id) === String(deviceFilter))
          ?.name || "—",
      clear: () => setDeviceFilter(""),
    });
  }
  if (status !== "all") {
    activeFilterChips.push({
      key: "status",
      label: "Statut",
      value: STATUS_LABELS[status] || status,
      clear: () => setStatus("all"),
    });
  }
  const activeFilterCount = activeFilterChips.length;

  const resetFilters = () => {
    setPartnerFilter("");
    setDeviceFilter("");
    setStatus("all");
  };
  return (
    <div className="space-y-6">
      {/* Barre collante : elle reste accrochée sous l'en-tête de l'application
          pendant le défilement, donc « Nouvelle activité » est toujours à
          portée sans remonter en haut de la page. L'écart est lu depuis la
          variable CSS publiée par l'en-tête, jamais deviné en dur. */}
      <section
        className="sticky z-20 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-white shadow-lg shadow-slate-900/10 lg:p-3.5"
        style={{ top: "var(--app-header-h, 4rem)" }}
      >
        <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-300 ring-1 ring-orange-300/20">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-orange-300">Suivi des programmes</p>
              <h1 className="text-xl font-bold tracking-tight text-white lg:text-2xl">Activités</h1>
              <p className="mt-0.5 text-xs text-slate-300">
                Planification, présence et suivi des activités terrain.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div
              role="group"
              aria-label="Mode d'affichage"
              className="flex max-w-full flex-shrink-0 overflow-x-auto rounded-xl border border-white/15 bg-white/5 p-1"
            >
              <button
                type="button"
                onClick={() => setViewMode("sections")}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${viewMode === "sections" ? "bg-orange-500 text-white shadow-sm" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}
              >
                <Layers className="w-4 h-4" />
                Par section
              </button>
              <button
                type="button"
                onClick={() => setViewMode("liste")}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${viewMode === "liste" ? "bg-orange-500 text-white shadow-sm" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}
              >
                <List className="w-4 h-4" />
                Liste complète
              </button>
              <button
                type="button"
                onClick={() => setViewMode("calendrier")}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${viewMode === "calendrier" ? "bg-orange-500 text-white shadow-sm" : "text-slate-200 hover:bg-white/10 hover:text-white"}`}
              >
                <CalendarDays className="w-4 h-4" />
                Calendrier
              </button>
            </div>
            {!isViewer && (
              <button className="btn-primary" onClick={openUploadModal}>
                <Plus className="w-4 h-4" />
                Nouvelle activité
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <CountCard label="Total" value={stats.total} icon={CalendarDays} accent="orange" />
        <CountCard label="Planifiées" value={stats.planned} icon={Calendar} accent="slate" />
        <CountCard label="En cours" value={stats.ongoing} icon={Clock} accent="orange" />
        <CountCard label="Terminées" value={stats.completed} icon={CheckCircle2} accent="emerald" />
      </section>

      {/* La recherche reste toujours accessible ; partenaire, dispositif et
          statut se replient, avec leurs valeurs actives resumees en pastilles.
          Le panneau deplie occupait 290 px avant la premiere activite. */}
      <section className="card rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Rechercher une activité..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`btn-ghost flex-shrink-0 border ${
              activeFilterCount > 0
                ? "border-orange-200 bg-orange-50 text-orange-700"
                : "border-slate-200"
            }`}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filtres
            {activeFilterCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-500 px-1.5 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {activeFilterChips.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={c.clear}
                title={`Retirer le filtre « ${c.label} »`}
                className="badge border-orange-200 bg-orange-50 text-orange-700 transition hover:bg-orange-100"
              >
                {c.label} : {c.value}
                <X className="ml-1.5 h-3 w-3" aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-medium text-slate-500 underline underline-offset-2 transition hover:text-slate-900"
            >
              Tout réinitialiser
            </button>
          </div>
        )}

        <div
          hidden={!filtersOpen}
          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3"
        >
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
      ) : viewMode === "sections" ? (
        <div className="space-y-6">
          {loading && (
            <div className="card p-6 text-center text-slate-500">
              Chargement...
            </div>
          )}
          {!loading && filteredActivities.length === 0 && (
            <EmptyState
              icon={CalendarDays}
              compact
              title={
                activities.length === 0
                  ? "Aucune activité enregistrée"
                  : "Aucune activité ne correspond à la recherche"
              }
              description={
                activities.length === 0
                  ? "Créez une activité, puis importez sa liste de présences pour alimenter les indicateurs."
                  : "Modifiez la recherche ou retirez un filtre pour élargir les résultats."
              }
              actionLabel={
                activities.length === 0
                  ? isViewer
                    ? undefined
                    : "Nouvelle activité"
                  : "Tout réinitialiser"
              }
              actionIcon={activities.length === 0 ? Plus : undefined}
              onAction={
                activities.length === 0
                  ? isViewer
                    ? undefined
                    : openUploadModal
                  : () => {
                      setSearch("");
                      resetFilters();
                    }
              }
            />
          )}
          {!loading && filteredActivities.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sectionPageActivities.map((activity) => (
                <ActivityGridCard
                  key={activity.id}
                  activity={activity}
                  canEdit={!isViewer}
                  onOpenDetail={() => navigate(`/activities/${activity.id}`)}
                  onEdit={() => openEdit(activity)}
                  onDelete={() => handleDelete(activity.id)}
                />
              ))}
            </div>
          )}
          {!loading && totalPages > 1 && (
            <ActivityPager
              currentPage={currentPage}
              totalPages={totalPages}
              totalActivities={filteredActivities.length}
              onPageChange={setCurrentPage}
            />
          )}
        </div>
      ) : (
        (() => {
          const paginated = filteredActivities.slice(
            (currentPage - 1) * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE,
          );
          return (
            <div className={`flex flex-col ${listGap}`}>
              {loading && (
                <div className="card p-6 text-center text-slate-500">
                  Chargement...
                </div>
              )}
              {!loading && filteredActivities.length === 0 && (
                <EmptyState
                  icon={CalendarDays}
                  compact
                  title={
                    activities.length === 0
                      ? "Aucune activité enregistrée"
                      : "Aucune activité ne correspond à la recherche"
                  }
                  description={
                    activities.length === 0
                      ? "Créez une activité, puis importez sa liste de présences pour alimenter les indicateurs."
                      : "Modifiez la recherche ou retirez un filtre pour élargir les résultats."
                  }
                  actionLabel={
                    activities.length === 0
                      ? isViewer
                        ? undefined
                        : "Nouvelle activité"
                      : "Tout réinitialiser"
                  }
                  actionIcon={activities.length === 0 ? Plus : undefined}
                  onAction={
                    activities.length === 0
                      ? isViewer
                        ? undefined
                        : openUploadModal
                      : () => {
                          setSearch("");
                          resetFilters();
                        }
                  }
                />
              )}
              {paginated.map((activity) => (
                <ActivityCard
                  cardPadding={cardPadding}
                  key={activity.id}
                  activity={activity}
                  canEdit={!isViewer}
                  onOpenDetail={() => navigate(`/activities/${activity.id}`)}
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
                    {filteredActivities.length} activités — page {currentPage} /{" "}
                    {totalPages} · 20 par page
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={currentPage === 1}
                      onClick={() => {
                        setCurrentPage((p) => p - 1);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" /> Précédent
                    </button>
                    <button
                      disabled={currentPage === totalPages}
                      onClick={() => {
                        setCurrentPage((p) => p + 1);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
                    >
                      Suivant <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}

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
            <form onSubmit={handleUpload} className="space-y-4 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/70 to-white p-4">
              <FormActivityFields
                role={role}
                form={form}
                setForm={setForm}
                partners={partners}
                devices={devices}
                regions={senegalRegions}
                coaches={coaches}
              />
              <ChecklistEditor
                tasks={createChecklist}
                setTasks={setCreateChecklist}
                teamMembers={teamMembers}
                isViewer={isViewer}
              />
              <FormSection
                icon={FileText}
                title="Rapport d'activité PDF"
                hint="optionnel"
              >
                <input
                  type="file"
                  accept=".pdf"
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100"
                  onChange={(e) =>
                    setCreateReportFile(e.target.files?.[0] || null)
                  }
                />
                {createReportFile && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" />
                    {createReportFile.name}
                  </p>
                )}
              </FormSection>

              <FormSection
                icon={Upload}
                title="Liste de présences Excel"
                hint="optionnel — peut être ajouté plus tard"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">
                    Importez la liste des présents.
                  </span>
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
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-100"
                  onChange={(e) => {
                    setForm({ ...form, file: e.target.files?.[0] || null });
                    setCreateImportPreview(null);
                    setCreateImportMapping({});
                    setCreatePreviewError("");
                  }}
                />
                {createPreviewError && (
                  <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {createPreviewError}
                  </p>
                )}
                {form.file && !createImportPreview && (
                  <button
                    type="button"
                    disabled={createPreviewing}
                    onClick={handleCreatePreview}
                    className="btn text-sm mt-2 disabled:opacity-50 flex items-center gap-2 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    <ScanSearch className="w-4 h-4" />
                    {createPreviewing
                      ? "Analyse en cours..."
                      : "Analyser le fichier"}
                  </button>
                )}
                {createImportPreview && (
                  <div className="mt-2">
                    <ImportPreviewPanel
                      preview={createImportPreview}
                      mapping={createImportMapping}
                      onMappingChange={setCreateImportMapping}
                      onReset={() => {
                        setCreateImportPreview(null);
                        setCreateImportMapping({});
                      }}
                      showConfirmButton={false}
                    />
                  </div>
                )}
              </FormSection>

              {/* Génération automatique de rapport */}
              <FormSection
                icon={Sparkles}
                title="Génération de rapport"
                hint="Génère un PDF automatiquement après création, depuis les données de l'activité."
              >
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Type de rapport à générer
                  </label>
                  <select
                    className="select mt-1"
                    value={createReportType}
                    onChange={(e) => setCreateReportType(e.target.value)}
                  >
                    {CREATE_REPORT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {createReportType && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2.5 py-1.5">
                      <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                      {CREATE_REPORT_TYPES.find((t) => t.value === createReportType)?.desc}
                    </p>
                  )}
                </div>

                {/* Rapport de référence (optionnel) */}
                {createReportType && createReportType !== "rapport_synthese" && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                      <Paperclip className="w-3 h-3" />
                      Rapport de référence (optionnel)
                    </label>
                    <p className="text-xs text-slate-400">
                      Joignez un rapport existant — le système clonera sa structure et remplacera les données par celles de cette activité.
                    </p>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => setCreateReferenceFile(e.target.files?.[0] || null)}
                      />
                      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500 hover:border-orange-300 hover:bg-orange-50/30 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        {createReferenceFile ? createReferenceFile.name : "Choisir un PDF…"}
                      </div>
                    </label>
                    {createReferenceFile && (
                      <button
                        type="button"
                        onClick={() => setCreateReferenceFile(null)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Retirer le fichier
                      </button>
                    )}
                  </div>
                )}
              </FormSection>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeUploadModal}
                  className="btn-ghost border"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="btn-primary disabled:opacity-60"
                >
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
                Nouvelle activité
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={closeUploadModal}
              >
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
          footer={
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="btn-ghost border"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="edit-activity-form"
                disabled={editSaving}
                className="btn-primary disabled:opacity-60"
              >
                {editSaving ? "Sauvegarde..." : "Enregistrer"}
              </button>
            </div>
          }
        >
          <form
            id="edit-activity-form"
            onSubmit={handleEditSave}
            className="space-y-4 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/50 via-white to-amber-50/40 p-3 sm:p-4"
          >
            <FormActivityFields
              role={role}
              form={editForm}
              setForm={setEditForm}
              partners={partners}
              devices={devices}
              regions={senegalRegions}
              coaches={coaches}
            />
            {editTasksLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement de la checklist...
              </div>
            ) : (
              <ChecklistEditor
                activityId={editForm.id}
                tasks={editTasks}
                setTasks={setEditTasks}
                teamMembers={teamMembers}
                isViewer={isViewer}
              />
            )}
          </form>

          {/* Rapport d'activité */}
          <div className="mt-5">
            <FormSection
              icon={FileText}
              title="Rapport d'activité"
            >
              {editForm.report_filename && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
                  <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <span className="text-xs text-slate-600 flex-1 truncate">
                    {editForm.report_filename}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePreviewReport(editForm.id)}
                    className="btn-ghost border text-xs flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Télécharger
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteReport}
                    disabled={reportDeleting}
                    className="btn-ghost border border-red-200 text-red-600 hover:bg-red-50 text-xs flex items-center gap-1 disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3" />{" "}
                    {reportDeleting ? "Suppression..." : "Supprimer"}
                  </button>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {editForm.report_filename
                    ? "Remplacer le rapport"
                    : "Ajouter un rapport"}
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    setReportFile(e.target.files[0] || null);
                    setReportError("");
                  }}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100"
                />
                {reportError && (
                  <p className="flex items-center gap-1.5 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {reportError}
                  </p>
                )}
                {reportFile && (
                  <p className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                    <Upload className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>{reportFile.name}</strong> sera envoyé en cliquant
                      sur <strong>« Enregistrer »</strong>.
                    </span>
                  </p>
                )}
              </div>
            </FormSection>
          </div>

          {/* Génération de rapport depuis les données */}
          <div className="mt-5">
            <FormSection
              icon={Sparkles}
              title="Générer un rapport"
              hint="Crée un PDF automatiquement depuis les données de l'activité."
            >
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type de rapport
                </label>
                <select
                  className="select mt-1"
                  value={editReportType}
                  onChange={(e) => {
                    setEditReportType(e.target.value);
                    if (e.target.value === "rapport_synthese") setEditReferenceFile(null);
                  }}
                >
                  <option value="rapport_synthese">Rapport synthétique</option>
                  <option value="liste_presence">Liste de présence</option>
                </select>
              </div>

              {/* Rapport de référence (optionnel) */}
              {editReportType !== "rapport_synthese" && <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Paperclip className="w-3 h-3" />
                  Rapport de référence (optionnel)
                </label>
                <p className="text-xs text-slate-400">
                  Joignez un rapport existant — le système clonera sa structure et remplacera les données par celles de cette activité.
                </p>
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => setEditReferenceFile(e.target.files?.[0] || null)}
                    />
                    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500 hover:border-orange-300 hover:bg-orange-50/30 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {editReferenceFile ? editReferenceFile.name : "Choisir un PDF…"}
                    </div>
                  </label>
                  {editReferenceFile && (
                    <button
                      type="button"
                      onClick={() => setEditReferenceFile(null)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </div>}

              <button
                type="button"
                onClick={handleGenerateEditReport}
                disabled={generatingEditReport}
                className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {generatingEditReport ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {editForm.report_filename ? "Regénérer le rapport" : "Générer le rapport"}
                  </>
                )}
              </button>
            </FormSection>
          </div>

          {/* Import liste de présences */}
          <div className="mt-5">
            <FormSection
              icon={Users}
              title="Liste de présences"
            >
            {editForm.participants > 0 && !clearParticipantsConfirm && (
              <span className="inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200">
                {editForm.participants} participant
                {editForm.participants > 1 ? "s" : ""} enregistré
                {editForm.participants > 1 ? "s" : ""}
              </span>
            )}

            {/* Bloc suppression avec confirmation inline */}
            {editForm.participants > 0 && (
              <div className="mb-3">
                {!clearParticipantsConfirm ? (
                  <button
                    type="button"
                    onClick={() => setClearParticipantsConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-2 text-xs font-medium text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer la liste existante et recommencer
                  </button>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-red-700">
                      Supprimer les {editForm.participants} participants
                      enregistrés pour cette activité ?
                    </p>
                    <p className="text-xs text-red-500">
                      Cette action est irréversible. Les participants resteront
                      dans la base globale.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setClearParticipantsConfirm(false)}
                        className="btn-ghost border text-xs"
                        disabled={clearingParticipants}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={handleClearParticipants}
                        disabled={clearingParticipants}
                        className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 disabled:opacity-60 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        {clearingParticipants
                          ? "Suppression..."
                          : "Confirmer la suppression"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {editForm.participants_manual !== "" &&
              editForm.participants_manual !== null &&
              !importDirectResult && (
                <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                  Estimation actuelle :{" "}
                  <strong>{editForm.participants_manual} présences</strong>.
                  L'import remplacera ce chiffre par le comptage réel.
                </div>
              )}

            {!importDirectResult ? (
              <div className="space-y-3">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    setImportFile(e.target.files[0] || null);
                    setImportDirectError("");
                    setImportPreview(null);
                    setImportSimulation(null);
                    setImportMapping({});
                    /* Un autre fichier : le compte rendu et l'option d'avant
                       ne le décrivent plus. */
                    setListeEnAttente(false);
                    setImportTelleQuelle(false);
                  }}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-orange-700 hover:file:bg-orange-100"
                />
                {importDirectError && (
                  <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    {importDirectError}
                  </p>
                )}

                {importFile && !importPreview && (
                  <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {/* Cet avertissement disait l'inverse : « Enregistrer » ne
                        traitait pas le fichier, et le perdait en fermant la
                        fiche. Il l'emporte désormais — jusqu'à la
                        confirmation, jamais au-delà. */}
                    <span>
                      Fichier sélectionné, pas encore importé. Cliquez sur{" "}
                      <strong>« Analyser le fichier »</strong> ci-dessous — ou
                      sur <strong>« Enregistrer »</strong>, qui l&apos;emportera
                      aussi et vous montrera ce qu&apos;il va faire avant
                      d&apos;écrire quoi que ce soit.
                    </span>
                  </div>
                )}

                {/* L'option accompagne le fichier, pas une étape : on la
                    proposait seulement après « Analyser », donc elle n'était
                    pas là sur le chemin direct. Elle vient avant les boutons
                    qui la consomment. */}
                {importFile && !importSimulation && (
                  <ChoixTelleQuelle
                    valeur={importTelleQuelle}
                    onChange={basculerTelleQuelle}
                  />
                )}

                {/* Bouton Analyser */}
                {!importPreview && (
                  <button
                    type="button"
                    disabled={!importFile || previewing}
                    onClick={handlePreview}
                    className="btn-primary text-sm w-full disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <ScanSearch className="w-4 h-4" />
                    {previewing ? "Analyse en cours..." : "Analyser le fichier"}
                  </button>
                )}

                {/* Prévisualisation du mapping */}
                {importPreview && !importSimulation && (
                  <>
                    <ImportPreviewPanel
                      preview={importPreview}
                      mapping={importMapping}
                      onMappingChange={setImportMapping}
                      onReset={() => {
                        setImportPreview(null);
                        setImportMapping({});
                      }}
                      onConfirm={handleSimuler}
                      importing={simulating}
                      libelleConfirmer="Vérifier ce que ça va faire"
                      libelleEnCours="Vérification…"
                    />
                  </>
                )}
                {/* « Enregistrer » a sauvé les champs et joué la liste sans
                    rien écrire. La fiche reste ouverte : il faut dire pourquoi,
                    sinon elle passe pour un bouton qui n'a pas marché. */}
                {listeEnAttente && importSimulation && (
                  <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>
                        Les modifications de l&apos;activité sont enregistrées.
                      </strong>{" "}
                      Il reste la liste de présences : voici ce qu&apos;elle va
                      faire. Rien n&apos;est encore écrit — cliquez sur{" "}
                      <strong>« Importer »</strong> pour la valider.
                    </span>
                  </div>
                )}

                {importSimulation && (
                  <ResumeSimulation
                    sim={importSimulation}
                    importing={importing}
                    onAnnuler={() => {
                      setImportSimulation(null);
                      setListeEnAttente(false);
                    }}
                    onImporter={handleDirectImport}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 space-y-1">
                  <p className="font-semibold">Import réussi !</p>
                  <p>
                    {importDirectResult.participants_importes} participant(s)
                    importé(s) sur {importDirectResult.total_lignes} ligne(s)
                  </p>
                  {importDirectResult.doublons_dans_activite > 0 && (
                    <p className="text-xs text-emerald-700">
                      {importDirectResult.doublons_dans_activite} doublon(s)
                      ignoré(s)
                    </p>
                  )}
                  {importDirectResult.lignes_ignorees_nom_prenom_manquants >
                    0 && (
                    <p className="text-xs text-amber-700">
                      {importDirectResult.lignes_ignorees_nom_prenom_manquants}{" "}
                      ligne(s) vide(s) ignorée(s)
                    </p>
                  )}
                  {importDirectResult.lignes_incompletes?.length > 0 && (
                    <p className="text-xs text-amber-700">
                      {importDirectResult.lignes_incompletes.length} personne(s)
                      importée(s) sans nom ou sans prénom — à compléter dans
                      Participants.
                    </p>
                  )}
                  {/* Signalé ici parce que c'est le seul moment où l'on a le
                      fichier en tête. Découvrir la répétition au moment
                      d'envoyer les attestations, c'est déjà trop tard. */}
                  {importDirectResult.noms_repetes > 0 && (
                    <p className="text-xs text-amber-700">
                      {importDirectResult.noms_repetes} nom(s) de famille
                      écrit(s) deux fois dans le fichier — corrigez-les dans
                      Campagnes → Attestations avant d&apos;envoyer.
                    </p>
                  )}
                </div>
                <DoublonsReunisInfo result={importDirectResult} />
                <RapprochementsEcartesInfo result={importDirectResult} />
                <ContactsIgnoresInfo result={importDirectResult} />
                <ColumnMappingInfo result={importDirectResult} />
              </div>
            )}
            </FormSection>
          </div>

          {/* Photos */}
          <div className="mt-5">
            <FormSection
              icon={Camera}
              title="Photos de l'activité"
            >
            {(() => {
              const count =
                activities.find((a) => a.id === editForm.id)?.photo_count ??
                0;
              return (
                <span
                  className={`inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5 border ${count >= 8 ? "text-red-600 bg-red-50 border-red-200" : count > 0 ? "text-orange-600 bg-orange-50 border-orange-200" : "text-slate-500 bg-slate-50 border-slate-200"}`}
                >
                  {count}/8 photo{count !== 1 ? "s" : ""}
                </span>
              );
            })()}
            <button
              type="button"
              onClick={() => {
                const act = activities.find((a) => a.id === editForm.id);
                if (act) handleOpenGallery(act);
              }}
              className="btn-secondary text-sm flex items-center gap-2 w-full justify-center"
            >
              <Camera className="w-4 h-4" />
              Voir / ajouter des photos
            </button>
            </FormSection>
          </div>

          {/* La revue de la liste entrée telle quelle. Elle n'apparaît que
              lorsqu'il y a quelque chose à trancher ou à signer. */}
          {role === "admin" &&
            activities.find((a) => a.id === editForm.id)
              ?.liste_telle_quelle && (
              <RevueListeTelleQuelle
                activityId={editForm.id}
                onChange={fetchActivities}
              />
            )}
        </ActivityModal>
      )}

      {/* ===== GALERIE PHOTOS — PANNEAU LATÉRAL (portal → hors stacking context) ===== */}
      {galleryActivity &&
        createPortal(
          <>
            {/* Fond sombre cliquable */}
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              style={{ zIndex: 9000 }}
              onClick={() => {
                setGalleryActivity(null);
                setLightboxIdx(null);
              }}
            />
            {/* Panneau latéral droit */}
            <div
              className="fixed right-0 top-0 h-full bg-white shadow-2xl flex flex-col w-full max-w-md"
              style={{ zIndex: 9001 }}
            >
              {/* En-tête */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100 flex-shrink-0">
                <p className="font-semibold text-slate-800 text-sm flex items-center gap-2 min-w-0">
                  <Camera className="w-4 h-4 text-orange-500 flex-shrink-0" />
                  <span className="truncate">{galleryActivity.title}</span>
                  <span
                    className={`text-xs font-normal rounded-full px-2 py-0.5 flex-shrink-0 border ${galleryPhotos.length >= 8 ? "text-red-600 bg-red-50 border-red-200" : "text-orange-600 bg-orange-50 border-orange-200"}`}
                  >
                    {galleryPhotos.length}/8 photo
                    {galleryPhotos.length > 1 ? "s" : ""}
                  </span>
                </p>
                <button
                  onClick={() => {
                    setGalleryActivity(null);
                    setLightboxIdx(null);
                  }}
                  className="ml-3 flex-shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
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
                    <label
                      className={`flex items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-400 transition-colors cursor-pointer py-3 text-sm font-medium text-orange-700 ${galleryUploading ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <Camera className="w-4 h-4" />
                      {galleryUploading
                        ? "Envoi en cours…"
                        : `Ajouter des photos — ${8 - galleryPhotos.length} emplacement${8 - galleryPhotos.length > 1 ? "s" : ""} restant (3 Mo max)`}
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
                    <p className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      {galleryError}
                    </p>
                  )}
                </div>
              )}

              {/* Grille de photos */}
              <div className="flex-1 overflow-y-auto p-4">
                {galleryLoading ? (
                  <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                    Chargement…
                  </div>
                ) : galleryPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-slate-500 gap-2">
                    <ImageIcon className="w-10 h-10 opacity-20" />
                    <p className="text-sm">Aucune photo pour le moment</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {galleryPhotos.map((photo, idx) => (
                      <div
                        key={photo.id}
                        className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 cursor-pointer hover:ring-2 hover:ring-orange-400 transition-all"
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
                        {(role === "admin" || photo.uploaded_by === user?.id) &&
                          !isViewer && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePhoto(photo.id);
                              }}
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
          document.body,
        )}

      {/* ===== LIGHTBOX (portal → hors stacking context) ===== */}
      {galleryActivity &&
        lightboxIdx !== null &&
        galleryPhotos[lightboxIdx] &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center bg-black/95"
            style={{ zIndex: 9999 }}
            onClick={() => setLightboxIdx(null)}
          >
            <img
              src={`${API_URL}/activities/${galleryActivity.id}/photos/${galleryPhotos[lightboxIdx].id}`}
              alt={galleryPhotos[lightboxIdx].filename}
              className="max-w-full max-h-full object-contain select-none"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">
              {lightboxIdx + 1} / {galleryPhotos.length}
            </div>
            {lightboxIdx > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx((i) => i - 1);
                }}
                className="absolute left-4 p-3 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {lightboxIdx < galleryPhotos.length - 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIdx((i) => i + 1);
                }}
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
          document.body,
        )}
    </div>
  );
}

function ImportResultSummary({ result }) {
  const imported = result.participants_importes ?? 0;
  const total = result.total_lignes ?? 0;
  const ignored = result.lignes_ignorees_nom_prenom_manquants ?? 0;
  const incompletes = result.lignes_incompletes ?? [];
  const duplicates = result.doublons_dans_activite ?? 0;
  const nomsRepetes = result.noms_repetes ?? 0;

  if (result.sans_fichier) {
    return (
      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          Activité créée avec succès.
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700 text-sm">
          Aucune liste de présences importée. Vous pourrez l&apos;ajouter
          ultérieurement via le bouton &laquo;&nbsp;Modifier&nbsp;&raquo;.
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
        <SummaryCard label="Lignes vides" value={ignored} />
        <SummaryCard label="Doublons" value={duplicates} />
      </div>
      {/* Le nom de famille recopié dans la case « Prénom » : signalé tant que
          le fichier est encore en tête, pas au moment d'envoyer. */}
      {nomsRepetes > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {nomsRepetes} nom{nomsRepetes > 1 ? "s" : ""} de famille écrit
          {nomsRepetes > 1 ? "s" : ""} deux fois dans le fichier (nom recopié
          dans la colonne « Prénom »). Corrigez-les dans Campagnes →
          Attestations : ils apparaîtraient ainsi sur les documents.
        </p>
      )}
      {/* Importées quand même. L'import exigeait un nom ET un prénom et
          rejetait le reste : des bénéficiaires réels disparaissaient des
          compteurs du centre. Ils y figurent désormais, et ce qui leur manque
          est dit ici. */}
      {incompletes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">
            {incompletes.length} personne{incompletes.length > 1 ? "s" : ""}{" "}
            importée
            {incompletes.length > 1 ? "s" : ""} avec une identité incomplète
          </p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
            {incompletes.slice(0, 50).map((l, i) => (
              <li key={i}>
                {[l.prenom, l.nom].filter(Boolean).join(" ") ||
                  l.email ||
                  l.telephone}{" "}
                — il manque le {l.manque.join(" et le ")}
              </li>
            ))}
          </ul>
          {incompletes.length > 50 && (
            <p className="mt-1">…et {incompletes.length - 50} autre(s).</p>
          )}
          <p className="mt-1.5 text-amber-700">
            Elles comptent dans les statistiques — les rejeter les aurait
            fausses. Complétez-les dans Participants, ou corrigez le fichier et
            réimportez-le.
          </p>
        </div>
      )}
      <DoublonsReunisInfo result={result} />
      <RapprochementsEcartesInfo result={result} />
      <ContactsIgnoresInfo result={result} />
      <ColumnMappingInfo result={result} />
    </div>
  );
}

/* Les lignes que l'import a réunies.
   Une même personne revient souvent deux fois sur une feuille de présence :
   écrite « Awa Diop » le matin et « Awa Marie Diop » l'après-midi, ou sans
   prénom la seconde fois. L'import n'en fait plus deux bénéficiaires — mais il
   ne peut pas le faire en silence : un import qui ramène 18 lignes pour 20 doit
   dire lesquelles, sinon le doute porte sur tout le reste. */
/* Ce qui a servi de preuve, dit en toutes lettres. « La même identité figure
   plus haut » ne disait pas sur quoi on s'était fondé — et on s'était fondé
   sur le nom seul, ce qui a fait disparaître 170 personnes d'une liste de
   1825. Le nom ne suffit plus : il faut que rien ne les sépare. */
const MOTIFS_DOUBLON = {
  identite_identique:
    "même nom, et rien ne les sépare — ni contact, ni genre, ni âge",
  meme_contact: "même adresse ou même numéro, et un nom qui dit la même chose",
  identite_incomplete: "identité incomplète, identique à une ligne précédente",
  /* Propre à la liste telle quelle : deux lignes du fichier retombaient sur
     une même fiche déjà en base. Sans ce garde-fou, le fichier porterait deux
     lignes et l'activité n'en compterait qu'une. */
  meme_fiche_existante:
    "les deux lignes désignaient une même fiche déjà enregistrée",
};

/**
 * La revue d'une liste entrée telle quelle.
 *
 * L'import n'a rien rapproché, sur demande. Ce qu'il aurait rapproché est
 * consigné, et l'activité porte un badge tant que personne ne l'a regardé.
 * Un administrateur tranche cas par cas — réunir ne supprime rien, les deux
 * lignes de présence restent telles qu'elles ont été écrites — puis signe.
 *
 * Signer sans tout trancher est permis : quelqu'un qui connaît sa liste n'a
 * pas à passer par chaque cas. Ce qui compte, c'est qu'une personne ait
 * regardé, et que le journal dise ce que la signature couvrait.
 */
function RevueListeTelleQuelle({ activityId, onChange }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [enCours, setEnCours] = useState(null);

  const charger = useCallback(async () => {
    try {
      const r = await api.get(`/activities/${activityId}/liste/rapprochements`);
      setData(r.data);
    } catch {
      setData(null); /* silencieux : c'est un complément, pas la fiche */
    }
  }, [activityId]);

  useEffect(() => {
    charger();
  }, [charger]);

  if (!data?.telle_quelle) return null;

  const trancher = async (rapprochement, decision) => {
    setEnCours(rapprochement.id);
    try {
      const r = await api.post(
        `/activities/${activityId}/liste/rapprochements/${rapprochement.id}`,
        { decision },
      );
      toast.success(
        decision === "reuni"
          ? r.data.reunies
            ? "Les deux fiches sont réunies. Aucune ligne de présence supprimée."
            : "Ces fiches désignaient déjà la même personne."
          : "Noté : ce sont deux personnes.",
      );
      await Promise.all([charger(), onChange?.()]);
    } catch (err) {
      toast.error(
        err?.response?.data?.error || "La décision n'a pas été enregistrée.",
      );
    } finally {
      setEnCours(null);
    }
  };

  const valider = async () => {
    setEnCours("valider");
    try {
      const r = await api.post(`/activities/${activityId}/liste/valider`);
      toast.success(
        r.data.non_tranches > 0
          ? /* Taire ce qui reste ferait croire le travail fini. */
            `Liste validée, ${r.data.non_tranches} cas laissé${r.data.non_tranches > 1 ? "s" : ""} sans décision.`
          : "Liste validée.",
      );
      await Promise.all([charger(), onChange?.()]);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La validation a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  const attente = data.rapprochements.filter((r) => !r.tranche);

  return (
    <div className="mt-5 border-t border-slate-200 pt-5">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        Liste importée telle quelle
      </p>
      <p className="mb-3 text-xs text-slate-500">
        Le fichier est entré tel qu&apos;il a été écrit : une ligne, une
        inscription. Voici ce que la plateforme aurait rapproché et qu&apos;elle
        a laissé.
        {data.validee_le && (
          <span className="mt-1 block text-emerald-700">
            Validée{data.validee_par ? ` par ${data.validee_par}` : ""} le{" "}
            {new Date(data.validee_le).toLocaleDateString("fr-FR")}.
          </span>
        )}
      </p>

      {attente.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Rien n&apos;attend de décision.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-amber-200 bg-amber-50/40">
          {attente.map((r) => (
            <li key={r.id} className="px-3 py-2.5 text-xs">
              <p className="font-medium text-slate-800">
                {[r.prenom, r.nom].filter(Boolean).join(" ")}
                {r.avec && (
                  <span className="font-normal text-slate-500">
                    {" "}
                    · aurait rejoint {r.avec}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-slate-500">
                {MOTIFS_DOUBLON[r.motif] || r.motif}
                {(r.email || r.telephone) &&
                  ` · ${[r.email, r.telephone].filter(Boolean).join(" · ")}`}
              </p>
              {r.deja_reunies && (
                /* Réunies depuis, par un autre écran : le dire évite de
                   proposer un geste sans effet. */
                <p className="mt-0.5 text-slate-400">
                  Déjà réunies depuis, par ailleurs.
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={enCours === r.id}
                  onClick={() => trancher(r, "reuni")}
                  className="rounded-lg border border-orange-300 px-2 py-1 font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                >
                  {enCours === r.id ? "…" : "C'est la même personne"}
                </button>
                <button
                  type="button"
                  disabled={enCours === r.id}
                  onClick={() => trancher(r, "distinct")}
                  className="rounded-lg border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                >
                  Ce sont deux personnes
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!data.validee_le && (
        <button
          type="button"
          onClick={valider}
          disabled={enCours === "valider"}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-orange-200 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-60"
        >
          {enCours === "valider" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Valider la liste
          {attente.length > 0 &&
            ` (${attente.length} cas non tranché${attente.length > 1 ? "s" : ""})`}
        </button>
      )}
    </div>
  );
}

/**
 * « Garder la liste telle quelle. »
 *
 * Aucune règle ne peut savoir si deux « Aissatou Diallo » sont une ou deux
 * personnes. Le responsable qui était en salle, lui, le sait souvent. On lui
 * donne donc le choix — et on lui dit ce qu'il coûte, avant qu'il coche, pas
 * après.
 */
function ChoixTelleQuelle({ valeur, onChange }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-xs transition-colors ${
        valeur
          ? "border-amber-300 bg-amber-50"
          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
      }`}
    >
      <input
        type="checkbox"
        checked={valeur}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-amber-600"
      />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-800">
          Garder la liste telle quelle
        </span>
        <span className="mt-0.5 block text-slate-600">
          Une ligne du fichier, une inscription. Aucun rapprochement ne sera
          fait entre deux lignes — utile quand vous savez que deux personnes
          portent vraiment le même nom.
        </span>
        {valeur && (
          <span className="mt-1.5 block text-amber-800">
            L&apos;activité passera <strong>sous réserve</strong> : ce que la
            plateforme aurait rapproché sera consigné, elle portera un badge, et
            un administrateur devra le trancher.
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * Ce que l'import aurait réuni et qu'il laisse.
 *
 * Le prix de la liste telle quelle. Il doit être lu avant de cliquer, pas
 * découvert après : sinon on échange une erreur silencieuse contre une autre.
 */
function RapprochementsEcartesInfo({ result }) {
  const ecartes = result?.rapprochements_ecartes ?? [];
  if (ecartes.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p className="font-semibold">
        {ecartes.length} rapprochement{ecartes.length > 1 ? "s" : ""} que la
        plateforme aurait fait{ecartes.length > 1 ? "s" : ""} et qu&apos;elle
        laisse
      </p>
      <p className="mt-0.5 text-amber-800">
        Ces lignes entreront séparément. Un administrateur les trancheront
        depuis l&apos;activité : même personne, ou deux personnes.
      </p>
      <ul className="mt-1.5 space-y-0.5">
        {ecartes.slice(0, 50).map((d, i) => (
          <li key={i}>
            <span className="font-medium">
              {[d.prenom, d.nom].filter(Boolean).join(" ")}
            </span>
            {d.avec && (
              <>
                {" "}
                — aurait rejoint <span className="font-medium">{d.avec}</span>
              </>
            )}
            {" · "}
            <span className="text-amber-700">
              {MOTIFS_DOUBLON[d.motif] || d.motif}
            </span>
            {(d.email || d.telephone) && (
              <span className="text-amber-700">
                {" "}
                · {[d.email, d.telephone].filter(Boolean).join(" · ")}
              </span>
            )}
          </li>
        ))}
      </ul>
      {ecartes.length > 50 && (
        <p className="mt-1">…et {ecartes.length - 50} autre(s).</p>
      )}
    </div>
  );
}

function DoublonsReunisInfo({ result }) {
  const reunis = result?.doublons_reunis ?? [];
  if (reunis.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <p className="font-semibold">
        {reunis.length} ligne{reunis.length > 1 ? "s" : ""} réunie
        {reunis.length > 1 ? "s" : ""} à une autre :{" "}
        {reunis.length > 1 ? "ce sont" : "c'est"} la même personne
      </p>
      <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto">
        {reunis.slice(0, 50).map((d, i) => (
          <li key={i}>
            {[d.prenom, d.nom].filter(Boolean).join(" ") ||
              d.email ||
              d.telephone ||
              "ligne sans nom"}
            {d.avec && ` → ${d.avec}`} — {MOTIFS_DOUBLON[d.motif] || d.motif}
          </li>
        ))}
      </ul>
      {reunis.length > 50 && (
        <p className="mt-1">…et {reunis.length - 50} autre(s).</p>
      )}
      <p className="mt-1.5 text-slate-600">
        Une seule fiche par personne, et un seul bénéficiaire compté pour cette
        activité. Si l&apos;un de ces rapprochements est faux — deux homonymes
        —, ajoutez la ligne manquante depuis la liste de l&apos;activité.
      </p>
    </div>
  );
}

/* Les adresses que l'import n'a pas enregistrées.
   Elles disparaissaient sans un mot : la fiche était créée, mais sans adresse,
   et la campagne partait plus courte que la liste de présence sans que rien ne
   l'explique. On les nomme ici, avec le motif et la personne qui détient déjà
   l'adresse, tant que le fichier est encore sous la main. */
const MOTIFS_CONTACT = {
  adresse_differente: (c) =>
    c.detenteur
      ? `déjà enregistrée sous une autre adresse pour ${c.detenteur} — c'est celle-là qui est conservée`
      : "cette personne est déjà enregistrée sous une autre adresse",
  /* Motifs des versions précédentes, quand une adresse ne pouvait désigner
     qu'une personne. Conservés pour ne pas afficher un code brut si un ancien
     rapport est relu. */
  deja_attribuee: (c) =>
    c.detenteur
      ? `déjà enregistrée pour ${c.detenteur}`
      : "déjà enregistrée pour quelqu'un d'autre",
  doublon_fichier: () =>
    "la même adresse figure sur plusieurs lignes du fichier",
};

function ContactsIgnoresInfo({ result }) {
  const ignores = result?.contacts_ignores ?? [];
  const rattachees = result?.fiches_completees ?? 0;
  const champs = result?.champs_completes ?? 0;

  if (ignores.length === 0 && rattachees === 0 && champs === 0) return null;

  return (
    <div className="space-y-2">
      {/* Chaque liste de présence porte des colonnes différentes. Une personne
          déjà connue voit sa fiche se compléter de ce que celle-ci apporte —
          c'est le contraire de ce que faisait l'import, qui les jetait. */}
      {champs > 0 && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {champs} information{champs > 1 ? "s" : ""} ajoutée
          {champs > 1 ? "s" : ""} à des fiches déjà enregistrées (email,
          téléphone, genre, tranche d&apos;âge, statut ou structure qui y
          manquaient)
          {rattachees > 0 &&
            `, dont ${rattachees} personne${rattachees > 1 ? "s" : ""} reconnue${rattachees > 1 ? "s" : ""} par son nom`}
          .
        </p>
      )}
      {ignores.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">
            {ignores.length} adresse{ignores.length > 1 ? "s" : ""} du fichier
            différente
            {ignores.length > 1 ? "s" : ""} de celle
            {ignores.length > 1 ? "s" : ""} enregistrée
            {ignores.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-1 space-y-0.5">
            {ignores.map((c, i) => (
              <li key={i}>
                <span className="font-medium">
                  {c.prenom} {c.nom}
                </span>{" "}
                — {c.valeur} : {(MOTIFS_CONTACT[c.motif] || (() => c.motif))(c)}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-amber-700">
            L&apos;adresse déjà enregistrée est conservée — le fichier
            n&apos;est pas forcément plus à jour. Si c&apos;est la nouvelle qui
            vaut, corrigez la fiche dans Participants.
          </p>
        </div>
      )}
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
  nom: "Nom",
  prenom: "Prénom",
  genre: "Genre",
  email: "Email",
  telephone: "Téléphone",
  structure: "Structure",
  tranche_age: "Tranche d'âge",
  statut: "Statut",
  nom_complet: "Nom complet",
};

/**
 * Ce que l'import va produire, avant qu'il le produise.
 *
 * Le nombre de lignes ne dit rien d'utile : une liste déjà importée en a
 * autant et n'ajoute personne. Ce sont les trois autres chiffres qui
 * décident, et le premier en particulier — si rien ne s'ajoute, il n'y a rien
 * à importer, et insister ne ferait que créer des fiches en double que
 * quelqu'un devra retirer un mois plus tard, sur le seul nom.
 */
function ResumeSimulation({ sim, importing, onAnnuler, onImporter }) {
  const rien = (sim.nouvelles_inscriptions ?? 0) === 0;
  const dejaLa = sim.deja_inscrites ?? 0;

  const Chiffre = ({ valeur, libelle, fort }) => (
    <div
      className={`rounded-xl border px-3 py-2 ${
        fort ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"
      }`}
    >
      <p
        className={`text-xl font-semibold ${fort ? "text-orange-700" : "text-slate-800"}`}
      >
        {valeur}
      </p>
      <p className="text-[11px] leading-tight text-slate-600">{libelle}</p>
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-800">
        Rien n&apos;a encore été enregistré. Voici ce que ce fichier ferait :
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chiffre valeur={sim.total_lignes} libelle="lignes dans le fichier" />
        <Chiffre
          valeur={sim.nouvelles_inscriptions}
          libelle="inscriptions ajoutées"
          fort
        />
        <Chiffre valeur={dejaLa} libelle="déjà inscrites" />
        <Chiffre
          valeur={sim.personnes_nouvelles}
          libelle="personnes inconnues de la base"
        />
      </div>

      {rien && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 flex-shrink-0"
            aria-hidden="true"
          />
          <span>
            <strong>Tout le monde est déjà inscrit à cette activité.</strong>{" "}
            Importer n&apos;ajouterait aucun bénéficiaire, mais pourrait créer
            des fiches en double qu&apos;il faudra retirer plus tard. Vérifiez
            que c&apos;est bien la bonne activité.
          </span>
        </div>
      )}

      {dejaLa > 0 && !rien && (
        <p className="text-xs text-slate-600">
          {dejaLa} ligne{dejaLa > 1 ? "s" : ""} de ce fichier{" "}
          {dejaLa > 1 ? "correspondent" : "correspond"} à quelqu&apos;un de déjà
          inscrit — {dejaLa > 1 ? "elles seront ignorées" : "elle sera ignorée"}
          .
        </p>
      )}

      {sim.doublons_dans_le_fichier > 0 && (
        <p className="text-xs text-slate-600">
          {sim.doublons_dans_le_fichier} personne
          {sim.doublons_dans_le_fichier > 1 ? "s figurent" : " figure"}{" "}
          plusieurs fois dans le fichier lui-même.{" "}
          {/* Sans cette phrase, le chiffre ne se vérifie pas : on lit « 170
              ignorées » sans pouvoir dire lesquelles ni pourquoi. Le détail
              ligne par ligne est juste en dessous. */}
          <span className="text-slate-500">
            Le détail ci-dessous dit, pour chacune, ce qui a servi de preuve.
          </span>
        </p>
      )}

      {sim.lignes_ignorees_nom_prenom_manquants > 0 && (
        <p className="text-xs text-amber-700">
          {sim.lignes_ignorees_nom_prenom_manquants} ligne(s) vide(s) seront
          ignorées.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onImporter}
          disabled={importing}
          className={`text-sm ${rien ? "btn-ghost border border-slate-300" : "btn-primary"} disabled:opacity-50`}
        >
          {importing
            ? "Import en cours…"
            : rien
              ? "Importer quand même"
              : `Importer (${sim.nouvelles_inscriptions} inscription${sim.nouvelles_inscriptions > 1 ? "s" : ""})`}
        </button>
        <button
          type="button"
          onClick={onAnnuler}
          disabled={importing}
          className="btn-ghost border border-slate-300 text-sm disabled:opacity-50"
        >
          Revenir
        </button>
      </div>
    </div>
  );
}

function ImportPreviewPanel({
  preview,
  mapping,
  onMappingChange,
  onReset,
  onConfirm,
  importing,
  showConfirmButton = true,
  libelleConfirmer,
  libelleEnCours,
}) {
  const {
    columns = [],
    total_rows = 0,
    header_row = 1,
    available_fields = [],
  } = preview;

  const effectiveField = (col) => mapping[col.original] || col.field;

  const recognized = columns.filter((c) => effectiveField(c));
  const unrecognized = columns.filter((c) => !effectiveField(c));
  const hasName = recognized.some((c) =>
    ["nom", "prenom", "nom_complet"].includes(effectiveField(c)),
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-4">
      {/* Résumé */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {total_rows} ligne{total_rows !== 1 ? "s" : ""} détectée
            {total_rows !== 1 ? "s" : ""}
          </p>
          {header_row > 1 && (
            <p className="text-xs text-amber-600 mt-0.5">
              En-tête détecté à la ligne {header_row}
            </p>
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
            {recognized.map((col) => (
              <div
                key={col.original}
                className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5"
              >
                <span className="text-xs font-medium text-emerald-700 w-24 flex-shrink-0">
                  {FIELD_LABELS[effectiveField(col)] ?? effectiveField(col)}
                </span>
                <span className="text-xs text-slate-500">←</span>
                <span className="text-xs text-slate-700 font-mono">
                  {col.original}
                </span>
                {col.samples.length > 0 && (
                  <span className="ml-auto text-xs text-slate-500 truncate max-w-[120px]">
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
            {unrecognized.map((col) => (
              <div
                key={col.original}
                className="flex items-center gap-2 rounded-lg bg-white border border-slate-200 px-3 py-1.5"
              >
                <span className="text-xs text-slate-700 font-mono flex-shrink-0 w-32 truncate">
                  {col.original}
                </span>
                {col.samples.length > 0 && (
                  <span className="text-xs text-slate-500 truncate flex-1">
                    ex : {col.samples[0]}
                  </span>
                )}
                <select
                  className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
                  value={mapping[col.original] || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    onMappingChange((prev) => {
                      const next = { ...prev };
                      if (val) next[col.original] = val;
                      else delete next[col.original];
                      return next;
                    });
                  }}
                >
                  <option value="">— Ignorer —</option>
                  {available_fields.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasName && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Aucune colonne nom/prénom détectée. Assignez au moins le nom et le
          prénom pour importer.
        </p>
      )}

      {showConfirmButton ? (
        <button
          type="button"
          disabled={!hasName || importing}
          onClick={onConfirm}
          className="btn-primary text-sm w-full disabled:opacity-50"
        >
          {importing
            ? libelleEnCours || "Import en cours..."
            : libelleConfirmer || `Confirmer l'import (${total_rows} lignes)`}
        </button>
      ) : !hasName ? null : (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          Mapping vérifié — sera importé avec le reste du formulaire.
        </p>
      )}
    </div>
  );
}

function ColumnMappingInfo({ result }) {
  const recognized = result?.colonnes_reconnues ?? {};
  const unrecognized = result?.colonnes_non_reconnues ?? [];
  const headerRow = result?.ligne_entete_detectee;
  if (Object.keys(recognized).length === 0 && unrecognized.length === 0)
    return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
      {headerRow > 1 && (
        <p className="text-amber-700 font-medium">
          En-tête détecté à la ligne {headerRow} (ligne(s) de titre ignorée(s))
        </p>
      )}
      {Object.keys(recognized).length > 0 && (
        <div>
          <p className="font-medium text-slate-600 mb-1">
            Colonnes reconnues :
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(recognized).map(([field, original]) => (
              <span
                key={field}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5"
              >
                <span className="font-medium">
                  {FIELD_LABELS[field] ?? field}
                </span>
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
          <p className="font-medium text-slate-500 mb-1">
            Colonnes ignorées (non reconnues) :
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unrecognized.map((col) => (
              <span
                key={col}
                className="rounded-full bg-slate-200 text-slate-500 px-2 py-0.5"
              >
                {col}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* === Éditeur de checklist intégré au formulaire d'activité ===
   En création (activityId null), les tâches sont stockées en brouillon
   et créées après l'enregistrement de l'activité. En édition, chaque
   opération (ajout, suppression, statut) est immédiate via l'API. */
const TASK_STATUSES = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
];

const TASK_STATUS_STYLE = {
  a_faire: { chip: "bg-slate-100 text-slate-600 border-slate-200" },
  en_cours: { chip: "bg-orange-100 text-orange-700 border-orange-200" },
  termine: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

function ChecklistEditor({
  activityId = null,
  tasks,
  setTasks,
  teamMembers = [],
  isViewer = false,
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState({ title: "", assigned_to: "", due_date: "" });

  const addTask = async () => {
    if (!draft.title.trim()) {
      toast.error("L'intitulé de la tâche est requis.");
      return;
    }
    const payload = {
      title: draft.title.trim(),
      assigned_to: draft.assigned_to ? Number(draft.assigned_to) : null,
      due_date: draft.due_date || null,
      status: "a_faire",
    };
    if (activityId) {
      try {
        const res = await api.post(`/activities/${activityId}/tasks`, payload);
        setTasks([...tasks, res.data]);
        toast.success("Tâche ajoutée à la checklist.");
      } catch {
        toast.error("Erreur lors de l'ajout de la tâche.");
      }
    } else {
      setTasks([...tasks, { ...payload, tempId: Date.now() }]);
    }
    setDraft({ title: "", assigned_to: "", due_date: "" });
  };

  const removeTask = async (task) => {
    const key = task.id || task.tempId;
    if (activityId && task.id) {
      const ok = await confirm({
        title: "Supprimer cette tâche ?",
        body: `« ${task.title} » sera retirée de la checklist.`,
        destructive: true,
      });
      if (!ok) return;
      try {
        await api.delete(`/activities/tasks/${task.id}`);
        setTasks(tasks.filter((t) => t.id !== task.id));
        toast.success("Tâche supprimée.");
      } catch {
        toast.error("Impossible de supprimer la tâche.");
      }
    } else {
      setTasks(tasks.filter((t) => (t.id || t.tempId) !== key));
    }
  };

  const changeStatus = async (task, status) => {
    if (task.status === status) return;
    const key = task.id || task.tempId;
    setTasks(
      tasks.map((t) =>
        (t.id || t.tempId) === key ? { ...t, status } : t,
      ),
    );
    if (activityId && task.id) {
      try {
        await api.patch(`/activities/tasks/${task.id}/status`, { status });
      } catch {
        toast.error("Impossible de changer le statut.");
      }
    }
  };

  const memberName = (id) => {
    const m = teamMembers.find((m) => String(m.id) === String(id));
    return m?.full_name || m?.email || "—";
  };

  return (
    <div className="space-y-3 rounded-2xl border border-orange-100 bg-gradient-to-br from-white to-orange-50/60 p-4 shadow-sm shadow-orange-100/40">
      <div className="flex items-center gap-2.5 border-b border-orange-100 pb-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-700 ring-1 ring-orange-200/70">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-800">
            Checklist de préparation
          </h3>
        </div>
        {tasks.length > 0 && (
          <span className="badge bg-orange-50 border-orange-200 text-orange-700">
            {tasks.length} tâche{tasks.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {!isViewer && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nouvelle tâche</label>
            <input
              className="input mt-1"
              placeholder="Ex : Préparer le matériel de formation"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTask();
                }
              }}
            />
          </div>
          {teamMembers.length > 0 && (
            <div className="sm:w-44">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Responsable</label>
              <select
                className="select mt-1"
                value={draft.assigned_to}
                onChange={(e) =>
                  setDraft({ ...draft, assigned_to: e.target.value })
                }
              >
                <option value="">—</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="sm:w-40">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Échéance</label>
            <input
              type="date"
              className="input mt-1"
              value={draft.due_date}
              onChange={(e) =>
                setDraft({ ...draft, due_date: e.target.value })
              }
            />
          </div>
          <button
            type="button"
            onClick={addTask}
            className="btn-primary text-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Ajouter
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">
          Aucune tâche.
          {isViewer
            ? ""
            : " Ajoutez les étapes de préparation de l'activité."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Tâche</th>
                <th className="px-3 py-2">Responsable</th>
                <th className="px-3 py-2">Échéance</th>
                <th className="px-3 py-2">État</th>
                {!isViewer && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const overdue =
                  task.due_date &&
                  task.status !== "termine" &&
                  new Date(task.due_date) <
                    new Date(new Date().toDateString());
                const style =
                  TASK_STATUS_STYLE[task.status] || TASK_STATUS_STYLE.a_faire;
                return (
                  <tr
                    key={task.id || task.tempId}
                    className="border-t hover:bg-orange-50/40 transition-colors"
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {task.title}
                      {task.description && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {task.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {task.assigned_to ? memberName(task.assigned_to) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {task.due_date ? (
                        <span
                          className={
                            overdue
                              ? "text-red-600 font-medium"
                              : "text-slate-600"
                          }
                        >
                          {new Date(task.due_date).toLocaleDateString("fr-FR")}
                          {overdue && " · retard"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isViewer ? (
                        <span className={`badge ${style.chip}`}>
                          {TASK_STATUSES.find(
                            (s) => s.value === task.status,
                          )?.label}
                        </span>
                      ) : (
                        <select
                          className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-100"
                          value={task.status}
                          onChange={(e) =>
                            changeStatus(task, e.target.value)
                          }
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    {!isViewer && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeTask(task)}
                          className="icon-btn icon-btn-danger"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Section de formulaire ──
   Carte/groupement visuel cohérent avec les .stat-card et .activity-card
   de la page : bord arrondi, icône orange en cercle, titre semi-gras. */
function FormSection({ icon: Icon, title, children, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 space-y-3">
      <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {hint && <p className="text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function FormActivityFields({
  role,
  form,
  setForm,
  partners,
  devices,
  regions,
  coaches = [],
}) {
  return (
    <div className="space-y-4">
      {/* ── Informations générales ── */}
      <FormSection icon={FileText} title="Informations générales">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Intitulé <span className="text-orange-500">*</span>
            </label>
            <input
              required
              className="input mt-1"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Description
            </label>
            <textarea
              className="input mt-1 min-h-20"
              value={form.description || ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
        </div>
      </FormSection>

      {/* ── Dates & durée ── */}
      <FormSection icon={CalendarDays} title="Dates & durée">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Date de début <span className="text-orange-500">*</span>
            </label>
            <input
              type="date"
              required
              className="input mt-1"
              value={form.activity_date}
              onChange={(e) =>
                setForm({ ...form, activity_date: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Date de fin
            </label>
            <input
              type="date"
              className="input mt-1"
              min={form.activity_date || undefined}
              value={form.date_fin || ""}
              onChange={(e) => setForm({ ...form, date_fin: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Durée (heures)
            </label>
            <input
              type="number"
              min="0"
              className="input mt-1"
              value={form.duration_hours}
              onChange={(e) =>
                setForm({ ...form, duration_hours: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Mode
            </label>
            <select
              className="select mt-1"
              value={form.mode || "presentiel"}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
            >
              <option value="presentiel">Présentiel</option>
              <option value="ligne">En ligne</option>
            </select>
          </div>
        </div>
      </FormSection>

      {/* ── Localisation & rattachement ── */}
      <FormSection
        icon={MapPin}
        title="Localisation & rattachement"
        hint="Lieu, dispositif et responsables liés à l'activité."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(form.mode || "presentiel") === "presentiel" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Lieu
              </label>
              <select
                className="select mt-1"
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
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
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dispositif
            </label>
            <select
              className="select mt-1"
              value={form.device_id}
              onChange={(e) => setForm({ ...form, device_id: e.target.value })}
            >
              <option value="">Sélectionner</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {role === "coach" && devices.length === 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Aucun dispositif ne vous est encore confié. Demandez-le à un
                administrateur.
              </p>
            )}
          </div>
          {role === "admin" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Partenaire
              </label>
              <select
                className="select mt-1"
                value={form.partner_id}
                onChange={(e) =>
                  setForm({ ...form, partner_id: e.target.value })
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
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Coach / Formateur
              </label>
              <select
                className="select mt-1"
                value={form.coach_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, coach_id: e.target.value })
                }
              >
                <option value="">Aucun</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || c.email}
                  </option>
                ))}
              </select>
              {coaches.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Aucun compte coach actif. Créez-en un depuis Utilisateurs.
                </p>
              )}
            </div>
          )}
        </div>
      </FormSection>

      {/* ── Participants ── */}
      <FormSection
        icon={Users}
        title="Participants"
        hint="Estimation provisoire — remplacée automatiquement après import Excel."
      >
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nombre de présences (estimé)
          </label>
          <input
            type="number"
            min="0"
            className="input mt-1"
            placeholder="Ex: 45"
            value={form.participants_manual ?? ""}
            onChange={(e) =>
              setForm({ ...form, participants_manual: e.target.value })
            }
          />
        </div>
      </FormSection>
    </div>
  );
}

/* ── Calendrier ── */
const STATUS_COLORS = {
  planned: { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" },
  ongoing: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    dot: "bg-orange-500",
  },
  completed: {
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
};

function CalendarView({
  activities,
  calendarDate,
  onDateChange,
  canEdit,
  onEdit,
  onDelete,
  onQrCode,
  onExport,
  onDownloadReport,
  onOpenGallery,
  showQrCode,
}) {
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

  const prevMonth = () =>
    onDateChange(
      new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1),
    );
  const nextMonth = () =>
    onDateChange(
      new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1),
    );
  const goToday = () => {
    onDateChange(new Date());
    setSelectedDay(null);
  };

  const selectedActivities = selectedDay
    ? activitiesByDate[selectedDay] || []
    : [];

  return (
    <div className="space-y-4">
      <div className="card p-4 lg:p-5">
        {/* Header navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <h2 className="text-base font-semibold text-slate-900 capitalize min-w-[160px] text-center">
              {format(calendarDate, "MMMM yyyy", { locale: fr })}
            </h2>
            <button
              type="button"
              onClick={nextMonth}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
          <button
            type="button"
            onClick={goToday}
            className="btn-ghost border text-sm"
          >
            Aujourd'hui
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
          {/* Headers */}
          {dayNames.map((d) => (
            <div
              key={d}
              className="bg-slate-50 py-2 text-center text-xs font-semibold text-slate-500"
            >
              {d}
            </div>
          ))}

          {/* Padding cells */}
          {Array.from({ length: startPad }).map((_, i) => (
            <div
              key={`pad-${i}`}
              className="bg-white min-h-[80px] p-1 lg:min-h-[100px]"
            />
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
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium mb-1 ${
                    todayDay
                      ? "bg-orange-500 text-white"
                      : isSelected
                        ? "bg-orange-100 text-orange-700"
                        : "text-slate-700"
                  }`}
                >
                  {format(day, "d")}
                </div>

                <div className="space-y-0.5">
                  {dayActivities.slice(0, 2).map((a) => {
                    const c = STATUS_COLORS[a.status] || STATUS_COLORS.planned;
                    return (
                      <div
                        key={a.id}
                        className={`rounded px-1 py-0.5 text-xs leading-tight truncate font-medium ${c.bg} ${c.text}`}
                      >
                        {a.title}
                      </div>
                    );
                  })}
                  {dayActivities.length > 2 && (
                    <div className="text-xs text-slate-500 px-1">
                      +{dayActivities.length - 2}
                    </div>
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
              {status === "planned"
                ? "Planifiée"
                : status === "ongoing"
                  ? "En cours"
                  : "Terminée"}
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
              {selectedActivities.length} activité
              {selectedActivities.length > 1 ? "s" : ""}
            </span>
          </p>
          {selectedActivities.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune activité ce jour.</p>
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
                  onDownloadReport={() =>
                    onDownloadReport && onDownloadReport(activity.id)
                  }
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

/* Carte statistique moderne : l'orange Sonatel/ODC porte l'identité.
   Chaque carte a une icône dans un cercle coloré, un chiffre XL et un
   hover qui l'élève avec une ombre orange. */
function CountCard({ label, value, icon: Icon, accent = "orange" }) {
  const accents = {
    orange: "border-orange-200 bg-gradient-to-br from-orange-50 to-white text-orange-700",
    slate: "border-sky-200 bg-gradient-to-br from-sky-50 to-white text-sky-700",
    emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-700",
  };
  return (
    <div className={`stat-card !p-3 rounded-xl hover:translate-y-0 hover:shadow-md ${accents[accent] || accents.orange}`}>
      {Icon && (
        <div className={`stat-card-icon !top-3 !right-3 !h-8 !w-8 rounded-lg ${accents[accent] || accents.orange}`}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold leading-tight ${accents[accent]?.split(" ").find((c) => c.startsWith("text-")) || "text-orange-700"}`}>{value}</p>
    </div>
  );
}

function ActivityModal({
  title,
  children,
  error = "",
  onClose,
  footer = null,
  maxWidthClass = "max-w-lg",
}) {
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-4">
      <div
        className={`card-solid w-full ${maxWidthClass} flex flex-col max-h-[90vh] overflow-hidden`}
      >
        {/* Header fixe — barre d'accent orange comme la page de liste. */}
        <div className="relative flex items-center justify-between gap-3 px-6 pt-5 pb-4 flex-shrink-0 border-b border-slate-100">
          <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-orange-400 to-orange-600" />
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenu scrollable */}
        <div className="overflow-y-auto flex-1 min-h-0 px-6 py-5">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {children}
        </div>

        {/* Barre d'action fixe */}
        {footer && (
          <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 bg-slate-50/50">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function QrModal({ activity, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  const checkinUrl = `${window.location.origin}/checkin/${activity.id}`;

  useEffect(() => {
    QRCode.toDataURL(checkinUrl, {
      width: 400,
      margin: 2,
      color: { dark: "#1e293b", light: "#ffffff" },
    })
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
      ctx.fillText(
        activity.title,
        canvas.width / 2,
        qrSize + padding + 32,
        maxWidth,
      );

      // Date
      if (activity.date) {
        ctx.fillStyle = "#64748b";
        ctx.font = "16px sans-serif";
        ctx.fillText(
          activity.date,
          canvas.width / 2,
          qrSize + padding + 58,
          maxWidth,
        );
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
            <p className="text-xs uppercase tracking-wide text-orange-500 font-semibold">
              QR Code d'émargement
            </p>
            <h3 className="font-semibold text-slate-900 mt-0.5 leading-tight">
              {activity.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex flex-col items-center mb-4">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="QR Code"
              className="rounded-xl border border-slate-200 shadow-sm"
              style={{ width: 220, height: 220 }}
            />
          ) : (
            <div className="w-[220px] h-[220px] rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center">
              <QrCode className="w-12 h-12 text-slate-300" />
            </div>
          )}
          <p className="mt-3 text-sm font-semibold text-slate-800 text-center leading-tight">
            {activity.title}
          </p>
          {activity.date && (
            <p className="mt-0.5 text-xs text-slate-500 text-center">
              {activity.date}
            </p>
          )}
        </div>

        <p className="text-center text-xs text-slate-500 break-all mb-4">
          {checkinUrl}
        </p>

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

        <p className="mt-3 text-center text-xs text-slate-500">
          Les participants scannent ce QR code pour s&apos;inscrire directement.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function ActivityPager({ currentPage, totalPages, totalActivities, onPageChange }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
      <p className="text-sm font-medium text-slate-600">
        {totalActivities} activités — page {currentPage} / {totalPages} · 20 par page
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => {
            onPageChange((page) => page - 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Précédent
        </button>
        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => {
            onPageChange((page) => page + 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40"
        >
          Suivant <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ActivityGridCard({
  activity,
  canEdit,
  onOpenDetail,
  onEdit,
  onDelete,
}) {
  /* Palette d'identité ODC : l'orange porte l'accent (activité en cours),
     le slate pour ce qui est planifié (neutre), l'emerald discret pour ce
     qui est terminé. */
  const statusColors = {
    planned: "bg-slate-100 border-slate-200 text-slate-600",
    ongoing: "bg-orange-100 border-orange-200 text-orange-700",
    completed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
  const participantsLabel =
    activity.participants > 0
      ? activity.personnes_distinctes ?? activity.participants
      : activity.participants_manual != null
        ? `~${activity.participants_manual}`
        : "—";

  return (
    <div className="activity-card flex h-full flex-col gap-2 p-3 pl-4">
      <div className="activity-card-accent" />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-semibold text-slate-900">
          {activity.title}
        </p>
        <span
          className={`badge flex-shrink-0 ${
            statusColors[activity.status] ||
            "bg-slate-100 border-slate-200 text-slate-700"
          }`}
        >
          {activity.statusLabel}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        {activity.coach_name
          ? `Formateur : ${activity.coach_name}`
          : `${activity.partner} · ${activity.device}`}
      </p>

      {activity.description && (
        <p
          className="line-clamp-1 text-xs text-slate-600"
          title={activity.description}
        >
          {activity.description}
        </p>
      )}

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
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

      <div className="mt-auto flex items-center justify-start gap-3 border-t border-slate-100 pt-2">
        <span className="inline-flex items-center gap-1.5 text-base font-bold text-slate-900">
          <Users className="h-4 w-4 text-orange-500" />
          {participantsLabel}
        </span>

        <div className="flex items-center gap-1.5">
          {onOpenDetail && (
            <button
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 px-4 text-sm font-bold text-white shadow-sm shadow-orange-200 transition-all hover:from-orange-600 hover:to-orange-700 hover:shadow-md hover:shadow-orange-300 active:scale-95"
              onClick={onOpenDetail}
              title="Voir la fiche détaillée : liste de présence, formulaire et documents"
            >
              <Eye className="w-4 h-4" />
              Voir plus
            </button>
          )}
          {canEdit && (
            <>
              <button
                className="icon-btn"
                onClick={onEdit}
                title="Modifier"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                className="icon-btn icon-btn-danger"
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
  );
}

function ActivityCard({
  activity,
  canEdit,
  onOpenDetail,
  onEdit,
  onDelete,
  onQrCode,
  onExport,
  onDownloadReport,
  onOpenGallery,
  showQrCode = true,
  cardPadding = "p-5",
}) {
  /* Le partenaire peut avoir fermé l'émargement par lien et QR code pour ses
     séances. On combine ici plutôt qu'à chaque endroit qui affiche une carte :
     une vue oubliée laisserait le bouton proposer un lien que le serveur
     refuse d'ouvrir. Une activité sans partenaire n'est soumise à aucune
     convention, d'où le « différent de false » plutôt qu'un test de vérité —
     une ancienne réponse d'API ne porte pas encore le champ. */
  const emargementOuvert = activity.emargement_actif !== false;
  /* Palette d'identité ODC : l'orange porte l'accent (activité en cours),
     le slate pour ce qui est planifié (neutre), l'emerald discret pour ce
     qui est terminé. */
  const statusColors = {
    planned: "bg-slate-100 border-slate-200 text-slate-600",
    ongoing: "bg-orange-100 border-orange-200 text-orange-700",
    completed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };

  return (
    <div className={`activity-card ${cardPadding} pl-6`}>
      <div className="activity-card-accent" />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 lg:flex-1">
          <p className="font-semibold text-slate-900 text-lg break-words">
            {activity.title}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {activity.coach_name
              ? `Formateur : ${activity.coach_name}`
              : `${activity.partner} · ${activity.device}`}
          </p>
          {activity.description && (
            /* Une description longue etirait la carte sur toute sa hauteur et
               desalignait la liste. Elle est bornee a deux lignes ; le texte
               complet reste accessible au survol et sur la fiche de
               modification. */
            <p
              className="mt-1 line-clamp-1 text-xs text-slate-600"
              title={activity.description}
            >
              {activity.description}
            </p>
          )}
          {/* Sous réserve : la liste est entrée telle qu'elle a été écrite, et
              personne n'a encore tranché ce que la plateforme aurait rapproché.
              Le chiffre est dans le badge — « sous réserve » sans chiffre ne dit
              pas s'il reste deux cas ou deux cents. */}
          {activity.liste_telle_quelle && !activity.liste_validee_le && (
            <p className="mt-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800"
                title="Liste importée telle quelle : un administrateur doit la valider"
              >
                <AlertTriangle className="h-3 w-3" />
                Liste sous réserve
                {activity.rapprochements_en_attente > 0 &&
                  ` — ${activity.rapprochements_en_attente} à trancher`}
              </span>
            </p>
          )}
          {activity.liste_telle_quelle && activity.liste_validee_le && (
            <p className="mt-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"
                title={`Liste importée telle quelle, validée${activity.liste_validee_par ? ` par ${activity.liste_validee_par}` : ""}`}
              >
                <Check className="h-3 w-3" />
                Liste validée
              </span>
            </p>
          )}

          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
            <span className="flex items-center gap-1.5 text-teal-700">
              <MapPin size={15} />
              {activity.location}
            </span>
            <span className="flex items-center gap-1.5 text-orange-700">
              <Calendar size={15} />
              {activity.date_fin && activity.date_fin !== activity.date
                ? `Du ${activity.date} au ${activity.date_fin}`
                : activity.date || "-"}
            </span>
          </p>

          {/* État du dossier : les pastilles sont rangées ici, sous l'identité
              de l'activité. Une teinte par sens — vert = validé, ambre = à
              vérifier, rouge = problème, neutre = sans objet. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`badge ${
                statusColors[activity.status] ||
                "bg-slate-100 border-slate-200 text-slate-700"
              }`}
            >
              {activity.statusLabel}
            </span>
            <span
              className={`badge ${
                activity.report_filename
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-slate-100 border-slate-200 text-slate-500"
              }`}
              title={
                activity.report_filename
                  ? `Rapport : ${activity.report_filename}`
                  : "Aucun rapport joint"
              }
            >
              {activity.report_filename ? "Rapport ✓" : "Sans rapport"}
            </span>
            {activity.participants === 0 && (
              <span
                className="badge bg-amber-50 border-amber-200 text-amber-700"
                title="Aucune liste de présences importée"
              >
                Sans liste
              </span>
            )}
            {activity.reliability_score != null && (
              <span
                className={`badge text-xs ${
                  activity.reliability_status === "validee"
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : activity.reliability_status === "rejetee"
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-amber-50 border-amber-200 text-amber-700"
                }`}
                title="Score de fiabilité des données"
              >
                Fiabilité {activity.reliability_score.toFixed(0)}%
              </span>
            )}
            {activity.photo_count > 0 && (
              <button
                onClick={onOpenGallery}
                className="badge flex items-center gap-1 border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
                title={`${activity.photo_count} photo${activity.photo_count > 1 ? "s" : ""}`}
              >
                <Camera className="w-3 h-3" />
                {activity.photo_count} photo{activity.photo_count > 1 ? "s" : ""}
              </button>
            )}
          </div>
        </div>

        {/* Bloc secondaire : le chiffre clé à droite, puis les actions
            regroupées. Les pastilles d'état sont remontées à gauche : sur une
            seule ligne elles se mélangeaient aux boutons et perdaient leur
            sens. Les boutons-icônes partagent la classe .icon-btn. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:flex-shrink-0 lg:justify-end">
          <div className="text-right">
            {activity.participants > 0 ? (
              <>
                <p className="text-xl font-bold text-slate-900 inline-flex items-center gap-1">
                  <Users className="h-4 w-4 text-orange-500" />
                  {activity.personnes_distinctes ?? activity.participants}
                </p>
                <p className="text-xs text-slate-500">Participants</p>
                {/* L'écart se dit ici, et nulle part ailleurs : c'est le seul
                    endroit où l'on regarde le chiffre en se demandant d'où il
                    vient. Sans lui, une même personne comptée deux fois reste
                    invisible jusqu'au jour où quelqu'un nettoie. */}
                {activity.personnes_distinctes != null &&
                  activity.participants > activity.personnes_distinctes && (
                    <p
                      className="text-[11px] text-amber-600"
                      title="Des lignes de la liste de présence désignent la même personne"
                    >
                      {activity.participants} lignes
                    </p>
                  )}
              </>
            ) : activity.participants_manual != null ? (
              <>
                <p
                  className="text-xl font-bold text-slate-500 inline-flex items-center gap-1"
                  title="Nombre estimé — liste non encore importée"
                >
                  <Users className="h-4 w-4 text-slate-400" />~
                  {activity.participants_manual}
                </p>
                <p className="text-xs text-slate-500">Estimé</p>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-slate-300 inline-flex items-center gap-1">
                  <Users className="h-4 w-4 text-slate-300" />—
                </p>
                <p className="text-xs text-slate-500">Participants</p>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onOpenDetail && (
              /* Le seul point d'entree vers la fiche detaillee (presences,
                 formulaire, documents) depuis la liste : sans lui, la page
                 existait sans qu'on puisse l'ouvrir. */
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors"
                onClick={onOpenDetail}
                title="Voir la fiche détaillée : liste de présence, formulaire et documents"
              >
                <Eye className="w-4 h-4" />
                Voir plus
              </button>
            )}
            {showQrCode && emargementOuvert && (
              <button
                className="icon-btn"
                onClick={onQrCode}
                title="QR Code d'émargement"
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}
            {onOpenGallery && (
              <button
                className="icon-btn"
                onClick={onOpenGallery}
                title="Photos de l'activité"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
            {activity.participants > 0 && (
              <button
                className="icon-btn"
                onClick={onExport}
                title="Télécharger liste de présences"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {activity.report_filename && onDownloadReport && (
              <button
                className="icon-btn"
                onClick={onDownloadReport}
                title={`Rapport : ${activity.report_filename}`}
              >
                <FileText className="w-4 h-4" />
              </button>
            )}
            {canEdit && (
              <>
                <button className="icon-btn" onClick={onEdit} title="Modifier">
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  className="icon-btn icon-btn-danger"
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
