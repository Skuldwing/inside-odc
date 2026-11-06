import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Users,
  Download,
  ArrowLeft,
  QrCode,
  FileText,
  Check,
  AlertTriangle,
  X,
  Plus,
  Search,
  Filter,
  Trash2,
  Pencil,
  ExternalLink,
  Copy,
  CheckCircle2,
  ShieldCheck,
  Mail,
  Phone,
  ChevronRight,
  ChevronLeft,
  UserCheck,
  RefreshCw,
  Sparkles,
  Share2,
  Eye,
  Camera,
  Upload,
  Paperclip,
  Clock,
  Layers,
  User,
  CheckCircle,
} from "lucide-react";
import QRCode from "qrcode";
import api from "../api";
import { useAuth } from "../auth/useAuth";
import { useToast, useConfirm } from "../components/ui";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

/* États d'une tâche de la checklist, dans l'ordre du cycle de vie. */
const TASK_STATUSES = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "termine", label: "Terminé" },
];

/* L'orange reste la couleur d'identite de l'ODC : il porte l'accent (bouton,
   avancement). Les etats n'ajoutent que deux tons discrets — un bleu-gris et
   un vert-gris — sur une base neutre, pour ne pas brouiller la lecture. */
const TASK_STATUS_STYLE = {
  a_faire: {
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    solid: "bg-slate-600 text-white",
  },
  en_cours: {
    chip: "bg-blue-50 text-blue-700 border-blue-200",
    solid: "bg-blue-600 text-white",
  },
  termine: {
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    solid: "bg-emerald-600 text-white",
  },
};

const taskStatusLabel = (value) =>
  TASK_STATUSES.find((s) => s.value === value)?.label || "À faire";

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { role, isViewer } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("presences"); // 'presences' | 'formulaire' | 'infos'

  // Search & filter in presence table
  const [searchTerm, setSearchTerm] = useState("");
  const [genreFilter, setGenreFilter] = useState("all");
  const [attestationFilter, setAttestationFilter] = useState("all");

  // QR Modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Add Participant Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState("new"); // 'new' | 'existing'
  const [existingParticipants, setExistingParticipants] = useState([]);
  const [searchExisting, setSearchExisting] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [newParticipantForm, setNewParticipantForm] = useState({
    nom: "",
    prenom: "",
    email: "",
    telephone: "",
    genre: "F",
    age_range: "18-25 ans",
    structure: "",
    statut: "etudiant",
  });
  const [addingParticipant, setAddingParticipant] = useState(false);

  // Attestations sending
  const [sendingAttestations, setSendingAttestations] = useState(false);

  // Available forms to link
  const [availableForms, setAvailableForms] = useState([]);
  const [selectedFormId, setSelectedFormId] = useState("");
  const [savingFormLink, setSavingFormLink] = useState(false);

  // Photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Checklist : les tâches d'organisation de l'activité
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState([]);
  const [taskForm, setTaskForm] = useState(null); // null = fermé
  const [savingTask, setSavingTask] = useState(false);

  /* Visionneuse : le rapport se consulte dans la page (PDF récupéré en blob,
     donc aucune redirection ni téléchargement), et les photos s'ouvrent en
     plein écran. */
  const [reportPreview, setReportPreview] = useState({ open: false, url: "", loading: false, error: "" });
  const [lightbox, setLightbox] = useState(-1); // index de la photo ouverte, -1 = fermé

  /* Génération de rapport : l'utilisateur choisit un type, le backend génère
     le PDF depuis les données de l'activité et le stocke comme un rapport. */
  const REPORT_TYPES = [
    { value: "rapport_synthese", label: "Rapport synthétique", desc: "Rapport détaillé en quatre pages avec les informations et chiffres clés de l'activité" },
    { value: "liste_presence", label: "Liste de présence", desc: "Liste formatée avec nom, tel, email et colonne signature" },
  ];
  const [reportType, setReportType] = useState("rapport_synthese");
  const [generatingReport, setGeneratingReport] = useState(false);
  const [deletingReport, setDeletingReport] = useState(false);
  const [referenceFile, setReferenceFile] = useState(null);
  /* Renommage des fichiers (rapport PDF et export liste). */
  const [renaming, setRenaming] = useState(null); /* "report" | "list" | null */
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const startRename = (field, currentName) => {
    /* Retirer l'extension pour l'édition. */
    const base = currentName ? currentName.replace(/\.(pdf|xlsx)$/i, "") : "";
    setRenaming(field);
    setRenameValue(base);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue("");
  };

  const submitRename = async () => {
    if (!renameValue.trim() || !renaming) return;
    setRenameSaving(true);
    try {
      const res = await api.patch(`/activities/${id}/rename-file`, {
        field: renaming,
        filename: renameValue.trim(),
      });
      toast.success("Fichier renommé avec succès.");
      setRenaming(null);
      setRenameValue("");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors du renommage.");
    } finally {
      setRenameSaving(false);
    }
  };

  const photosList = data?.photos || [];

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get(`/activities/${id}`);
      setData(res.data);
      if (res.data?.activity?.form_id) {
        setSelectedFormId(String(res.data.activity.form_id));
      }
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || "Erreur de chargement de l'activité.");
    } finally {
      setLoading(false);
    }
  };

  /* La checklist se charge à part : une activité sans tâche ne doit pas
     retarder l'affichage des présences. */
  const fetchTasks = async () => {
    try {
      setTasksLoading(true);
      const res = await api.get(`/activities/${id}/tasks`);
      setTasks(res.data || []);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetail();
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchTasks();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [id]);

  /* Annuaire des responsables : inutile pour un lecteur, qui ne modifie rien. */
  useEffect(() => {
    if (!id || isViewer) return;
    api.get("/activities/team-members")
      .then((r) => setTeamMembers(r.data || []))
      .catch(() => setTeamMembers([]));
  }, [id, isViewer]);

  useEffect(() => {
    if (role === "admin") {
      api.get("/forms")
        .then((r) => setAvailableForms(r.data || []))
        .catch(() => setAvailableForms([]));
    }
  }, [role]);

  // Generate QR Code URL
  const checkinFullUrl = `${window.location.origin}/checkin/${id}`;

  useEffect(() => {
    if (id) {
      QRCode.toDataURL(checkinFullUrl, {
        width: 450,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
      })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""));
    }
  }, [id, checkinFullUrl]);

  const copyCheckinLink = () => {
    navigator.clipboard.writeText(checkinFullUrl);
    setLinkCopied(true);
    toast.success("Lien d'émargement copié dans le presse-papier !");
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const handleDownloadQr = () => {
    const qrSize = 400;
    const padding = 24;
    const textAreaHeight = 80;
    const canvas = document.createElement("canvas");
    canvas.width = qrSize + padding * 2;
    canvas.height = qrSize + padding * 2 + textAreaHeight;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, qrSize, qrSize);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      const maxWidth = canvas.width - padding * 2;
      ctx.fillText(data?.activity?.title || "Émargement", canvas.width / 2, qrSize + padding + 32, maxWidth);

      ctx.fillStyle = "#64748b";
      ctx.font = "15px sans-serif";
      ctx.fillText(`Scannez pour émarger • Inside ODC`, canvas.width / 2, qrSize + padding + 60, maxWidth);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `qr-emargement-${id}.png`;
      a.click();
    };
    img.src = qrDataUrl;
  };

  const toggleEmargement = async () => {
    if (!data?.activity) return;
    const currentFerme = Boolean(data.activity.emargement_ferme_manuellement);
    try {
      await api.patch(`/activities/${id}/emargement`, { fermer: !currentFerme });
      toast.success(currentFerme ? "Émargement rouvert avec succès." : "Émargement fermé manuellement.");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de la mise à jour de l'émargement.");
    }
  };

  const handleSaveLinkedForm = async () => {
    try {
      setSavingFormLink(true);
      await api.patch(`/activities/${id}/form`, { form_id: selectedFormId ? Number(selectedFormId) : null });
      toast.success("Formulaire associé mis à jour !");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de l'association du formulaire.");
    } finally {
      setSavingFormLink(false);
    }
  };

  const openAddModal = async () => {
    setAddModalOpen(true);
    setNewParticipantForm({
      nom: "",
      prenom: "",
      email: "",
      telephone: "",
      genre: "F",
      age_range: "18-25 ans",
      structure: "",
      statut: "etudiant",
    });
    try {
      const res = await api.get("/participants?limit=200");
      setExistingParticipants(res.data?.rows || []);
    } catch {
      setExistingParticipants([]);
    }
  };

  const handleAddParticipant = async (e) => {
    e.preventDefault();
    setAddingParticipant(true);
    try {
      if (addMode === "existing") {
        if (!selectedExistingId) {
          toast.error("Veuillez sélectionner un participant.");
          return;
        }
        await api.post(`/activities/${id}/participants`, { participant_id: Number(selectedExistingId) });
      } else {
        if (!newParticipantForm.nom || !newParticipantForm.prenom) {
          toast.error("Le nom et le prénom sont obligatoires.");
          return;
        }
        await api.post(`/activities/${id}/participants`, newParticipantForm);
      }
      toast.success("Participant inscrit avec succès sur l'activité !");
      setAddModalOpen(false);
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de l'inscription.");
    } finally {
      setAddingParticipant(false);
    }
  };

  const handleRemoveParticipant = async (participant) => {
    const ok = await confirm({
      title: "Retirer de la liste de présence ?",
      body: `Êtes-vous sûr de vouloir retirer ${participant.prenom} ${participant.nom} de cette activité ? La fiche participant sera conservée.`,
      confirmLabel: "Retirer",
      danger: true,
    });
    if (!ok) return;

    try {
      await api.delete(`/activities/${id}/participants/${participant.id}`);
      toast.success("Participant retiré de cette activité.");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors du retrait.");
    }
  };

  const handleExportPresenceExcel = () => {
    window.location.href = `${api.defaults.baseURL || ""}/activities/${id}/participants/export`;
  };

                const handleSendAttestations = async () => {
    const ok = await confirm({
      title: "Envoyer les attestations de présence ?",
      body: `Des attestations PDF personnalisées seront envoyées par e-mail à tous les participants ayant une adresse valide sur cette activité.`,
      confirmLabel: "Envoyer les attestations",
    });
    if (!ok) return;

    setSendingAttestations(true);
    try {
      const res = await api.post(`/activities/${id}/send-attestations`);
      toast.success(res.data?.message || "Attestations envoyées avec succès !");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de l'envoi des attestations.");
    } finally {
      setSendingAttestations(false);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("photo", file);
    setUploadingPhoto(true);
    try {
      await api.post(`/activities/${id}/photos`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Photo ajoutée avec succès !");
      fetchDetail();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de l'ajout de la photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  /* Aperçu du rapport : le PDF est récupéré en mémoire (blob) puis affiché
     dans la page. Le bouton « Télécharger » reste disponible à côté. */
  const openReportPreview = async () => {
    setReportPreview({ open: true, url: "", loading: true, error: "" });
    try {
      const res = await api.get(`/activities/${id}/report`, {
        params: { inline: 1 },
        responseType: "blob",
      });
      const url = URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" })
      );
      setReportPreview({ open: true, url, loading: false, error: "" });
    } catch (err) {
      setReportPreview({
        open: true,
        url: "",
        loading: false,
        error: err?.response?.data?.error || "Impossible d'ouvrir le rapport.",
      });
    }
  };

  const closeReportPreview = () =>
    setReportPreview({ open: false, url: "", loading: false, error: "" });

  /* Génère un PDF depuis les données de l'activité. Le backend compile
     participants, stats et checklist, puis stocke le résultat. Si un
     fichier de référence est joint, son texte est extrait et inclus. */
  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const formData = new FormData();
      formData.append("report_type", reportType);
      if (referenceFile) {
        formData.append("reference", referenceFile);
      }
      const res = await api.post(
        `/activities/${id}/generate-report`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      toast.success(
        `Rapport « ${res.data?.report_label || "généré"} » créé avec succès.`
      );
      setReferenceFile(null);
      fetchDetail();
    } catch (err) {
      toast.error(
        err?.response?.data?.error || "Erreur lors de la génération du rapport."
      );
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleDeleteReport = async () => {
    const ok = await confirm({
      title: "Supprimer le rapport ?",
      body: "Le rapport actuel sera définitivement supprimé. Vous pourrez en régénérer un à tout moment.",
      destructive: true,
    });
    if (!ok) return;
    setDeletingReport(true);
    try {
      await api.delete(`/activities/${id}/report`);
      toast.success("Rapport supprimé.");
      fetchDetail();
    } catch (err) {
      toast.error(
        err?.response?.data?.error || "Erreur lors de la suppression."
      );
    } finally {
      setDeletingReport(false);
    }
  };

  const closeLightbox = () => setLightbox(-1);
  const showPrevPhoto = () =>
    setLightbox((i) => (i <= 0 ? photosList.length - 1 : i - 1));
  const showNextPhoto = () =>
    setLightbox((i) => (i >= photosList.length - 1 ? 0 : i + 1));

  /* Libère l'URL du PDF dès qu'on la remplace ou qu'on quitte la page. */
  useEffect(() => {
    return () => {
      if (reportPreview.url) URL.revokeObjectURL(reportPreview.url);
    };
  }, [reportPreview.url]);

  /* Échap ferme la visionneuse ouverte ; les flèches font défiler les photos. */
  useEffect(() => {
    if (lightbox < 0 && !reportPreview.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (lightbox >= 0) closeLightbox();
        else closeReportPreview();
      } else if (lightbox >= 0 && photosList.length > 0) {
        if (e.key === "ArrowLeft") showPrevPhoto();
        if (e.key === "ArrowRight") showNextPhoto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, reportPreview.open, photosList.length]);

  /* ── Checklist : création, affectation, échéance et avancement ── */
  const openTaskForm = (task = null) => {
    setTaskForm(
      task
        ? {
            id: task.id,
            title: task.title || "",
            description: task.description || "",
            status: task.status || "a_faire",
            assigned_to: task.assigned_to ? String(task.assigned_to) : "",
            due_date: task.due_date ? String(task.due_date).slice(0, 10) : "",
          }
        : {
            id: null,
            title: "",
            description: "",
            status: "a_faire",
            assigned_to: "",
            due_date: "",
          }
    );
  };

  const saveTask = async (e) => {
    e.preventDefault();
    if (!taskForm?.title.trim()) {
      toast.error("L'intitulé de la tâche est requis.");
      return;
    }
    setSavingTask(true);
    try {
      const payload = {
        title: taskForm.title.trim(),
        description: taskForm.description,
        status: taskForm.status,
        assigned_to: taskForm.assigned_to ? Number(taskForm.assigned_to) : null,
        due_date: taskForm.due_date || null,
      };
      if (taskForm.id) {
        await api.put(`/activities/tasks/${taskForm.id}`, payload);
        toast.success("Tâche mise à jour.");
      } else {
        await api.post(`/activities/${id}/tasks`, payload);
        toast.success("Tâche ajoutée à la checklist.");
      }
      setTaskForm(null);
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de l'enregistrement de la tâche.");
    } finally {
      setSavingTask(false);
    }
  };

  /* Le statut change au clic, sans attendre le serveur : on revient à l'état
     réel seulement si l'enregistrement échoue. */
  const changeTaskStatus = async (task, status) => {
    if (task.status === status) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api.patch(`/activities/tasks/${task.id}/status`, { status });
    } catch {
      toast.error("Impossible de changer le statut de la tâche.");
      fetchTasks();
    }
  };

  const deleteTask = async (task) => {
    const ok = await confirm({
      title: "Supprimer cette tâche ?",
      body: `« ${task.title} » sera retirée de la checklist de l'activité.`,
      confirmLabel: "Supprimer",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/activities/tasks/${task.id}`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      toast.success("Tâche supprimée.");
    } catch {
      toast.error("Impossible de supprimer la tâche.");
    }
  };

  const taskStats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "termine").length;
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  // Filtered participants list
  const filteredParticipants = useMemo(() => {
    if (!data?.participants) return [];
    const q = searchTerm.trim().toLowerCase();
    return data.participants.filter((p) => {
      if (genreFilter !== "all" && p.genre !== genreFilter) return false;
      if (attestationFilter === "sent" && !p.attestation_envoyee_le) return false;
      if (attestationFilter === "pending" && p.attestation_envoyee_le) return false;
      if (q) {
        const full = `${p.nom || ""} ${p.prenom || ""} ${p.email || ""} ${p.telephone || ""} ${p.structure || ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [data?.participants, searchTerm, genreFilter, attestationFilter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="text-sm font-medium text-slate-500">Chargement des détails de l&apos;activité...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 rounded-2xl bg-red-50 border border-red-200 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-red-900 mb-2">Activité introuvable</h2>
        <p className="text-sm text-red-700 mb-6">{error || "Cette activité n'existe pas ou vous n'avez pas les droits pour la consulter."}</p>
        <button onClick={() => navigate("/activities")} className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour aux activités
        </button>
      </div>
    );
  }

  const { activity, participants, form: formInfo, photos, stats } = data;

  const statusColors = {
    planned: "bg-slate-100 border-slate-200 text-slate-600",
    ongoing: "bg-orange-100 border-orange-200 text-orange-700",
    completed: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };

  const statusLabel =
    activity.status === "completed"
      ? "Terminée"
      : activity.status === "ongoing"
      ? "En cours"
      : "Planifiée";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/activities")}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour à la liste des activités
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setQrModalOpen(true)}
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
            title="Afficher le QR code et le lien d'émargement"
          >
            <QrCode className="w-4 h-4 text-orange-500" />
            <span>QR Code & Lien</span>
          </button>
          <button
            onClick={handleExportPresenceExcel}
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 text-emerald-700 hover:text-emerald-800"
            title="Exporter la liste de présence au format Excel"
          >
            <Download className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
          {!isViewer && (
            <button
              onClick={() => startRename("list", activity.list_export_name || "")}
              disabled={renaming === "list"}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 text-slate-600 hover:text-orange-600 disabled:opacity-50"
              title="Renommer le fichier d'export"
            >
              <Pencil className="w-4 h-4" />
              <span>Renommer</span>
            </button>
          )}
          {!isViewer && (
            <button
              onClick={handleSendAttestations}
              disabled={sendingAttestations || stats.avec_email === 0}
              className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3 disabled:opacity-50"
              title="Envoyer les attestations par mail"
            >
              <Mail className="w-4 h-4" />
              <span>{sendingAttestations ? "Envoi..." : "Envoyer attestations"}</span>
            </button>
          )}
        </div>

        {/* Input de renommage pour l'export liste */}
        {renaming === "list" && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">Nom du fichier :</span>
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") cancelRename();
              }}
              className="text-xs rounded-lg border border-orange-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-100 flex-1 max-w-[240px]"
              placeholder="Ex: Liste présences Formation Dakar"
            />
            <span className="text-[10px] text-slate-400">.xlsx</span>
            <button
              type="button"
              onClick={submitRename}
              disabled={renameSaving}
              className="icon-btn h-7 w-7 hover:bg-orange-100"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={cancelRename} className="icon-btn h-7 w-7">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Hero Header Card */}
      <section className="surface-glass p-4 md:p-5 rounded-2xl relative overflow-hidden border border-slate-200/80 shadow-md">
        {/* Accent décoratif orange : un cercle dégradé subtil en arrière-plan
            qui rappelle l'identité Sonatel/ODC sans surcharger la lecture. */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-orange-100/50 to-transparent rounded-full -translate-y-1/3 translate-x-1/3 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`badge font-semibold ${statusColors[activity.status] || "bg-slate-100 text-slate-700"}`}>
                {statusLabel}
              </span>
              {activity.mode && (
                <span className="badge bg-slate-100 text-slate-700 font-medium">
                  {activity.mode === "ligne" ? "🌐 En ligne" : "📍 Présentiel"}
                </span>
              )}
              {activity.device_name && (
                <span className="badge bg-orange-50 border-orange-200 text-orange-700 font-semibold">
                  {activity.device_name}
                </span>
              )}
              {activity.partner_name && (
                <span className="badge bg-slate-100 text-slate-600 font-normal">
                  Partenaire : {activity.partner_name}
                </span>
              )}
              {activity.reliability_score != null && (
                <span className="badge bg-emerald-50 border-emerald-200 text-emerald-700 font-medium">
                  Fiabilité {Math.round(activity.reliability_score)}%
                </span>
              )}
            </div>

            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-orange-700 leading-tight">
              {activity.title}
            </h1>

            {activity.description && (
              <p className="text-slate-600 text-sm leading-relaxed max-w-4xl">
                {activity.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-y-1 gap-x-5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5 font-medium text-slate-700">
                <Calendar className="w-4 h-4 text-orange-500" />
                {activity.date_fin && activity.date_fin !== activity.activity_date
                  ? `Du ${formatDate(activity.activity_date)} au ${formatDate(activity.date_fin)}`
                  : formatDate(activity.activity_date)}
              </span>
              {activity.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-orange-600" />
                  {activity.location}
                </span>
              )}
              {activity.duration_hours && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-orange-600" />
                  {activity.duration_hours}h de formation
                </span>
              )}
              {activity.coach_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4 text-orange-600" />
                  Coach / Formateur : {activity.coach_name}
                </span>
              )}
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-1.5 shrink-0">
            <button
              onClick={openAddModal}
              className="btn-primary text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Inscrire un participant</span>
            </button>
            <button
              onClick={toggleEmargement}
              className={`btn-ghost border text-xs flex items-center justify-center gap-2 ${
                formInfo.emargement_actif ? "text-amber-700 border-amber-300 hover:bg-amber-50" : "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
              }`}
            >
              {formInfo.emargement_actif ? "Fermer l'émargement" : "Ouvrir l'émargement"}
            </button>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card !p-3 rounded-xl border-orange-200 bg-gradient-to-br from-orange-50 to-white hover:translate-y-0 hover:shadow-md hover:shadow-orange-100/60">
          <div className="flex items-center justify-between gap-1 text-slate-600">
            <span className="text-[11px] uppercase font-bold tracking-wide">Inscrits & Présences</span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-orange-100">
              <Users className="w-3.5 h-3.5 text-orange-600" />
            </div>
          </div>
          <div className="mt-1.5">
            <p className="text-2xl font-extrabold leading-tight text-orange-700">{stats.total}</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {activity.personnes_distinctes != null && activity.personnes_distinctes !== stats.total
                ? `${activity.personnes_distinctes} personnes distinctes`
                : "Participants enregistrés"}
            </p>
          </div>
        </div>

        <div className="stat-card !p-3 rounded-xl border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white hover:translate-y-0 hover:shadow-md hover:shadow-fuchsia-100/60">
          <div className="flex items-center justify-between gap-1 text-slate-600">
            <span className="text-[11px] uppercase font-bold tracking-wide">Parité Femmes / Hommes</span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fuchsia-100">
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-600" />
            </div>
          </div>
          <div className="mt-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold leading-tight text-fuchsia-700">
                {stats.total > 0 ? Math.round((stats.femmes / stats.total) * 100) : 0}%
              </span>
              <span className="text-[11px] text-slate-600">Femmes ({stats.femmes})</span>
            </div>
            {/* Visual ratio bar */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden flex">
              <div
                className="bg-orange-500 h-full transition-all"
                style={{ width: `${stats.total > 0 ? (stats.femmes / stats.total) * 100 : 0}%` }}
              />
              <div
                className="bg-slate-400 h-full transition-all"
                style={{ width: `${stats.total > 0 ? (stats.hommes / stats.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        <div className="stat-card !p-3 rounded-xl border-emerald-200 bg-gradient-to-br from-emerald-50 to-white hover:translate-y-0 hover:shadow-md hover:shadow-emerald-100/60">
          <div className="flex items-center justify-between gap-1 text-slate-600">
            <span className="text-[11px] uppercase font-bold tracking-wide">Attestations</span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            </div>
          </div>
          <div className="mt-1.5">
            <p className="text-2xl font-extrabold leading-tight text-emerald-700">
              {stats.attestations_envoyees} <span className="text-xs font-semibold text-emerald-700/70">/ {stats.avec_email}</span>
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {stats.avec_email > 0
                ? `${Math.round((stats.attestations_envoyees / stats.avec_email) * 100)}% des personnes avec email`
                : "Aucun email renseigné"}
            </p>
          </div>
        </div>

        <div className="stat-card !p-3 rounded-xl border-sky-200 bg-gradient-to-br from-sky-50 to-white hover:translate-y-0 hover:shadow-md hover:shadow-sky-100/60">
          <div className="flex items-center justify-between gap-1 text-slate-600">
            <span className="text-[11px] uppercase font-bold tracking-wide">Statut Émargement</span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100">
              <QrCode className="w-3.5 h-3.5 text-sky-600" />
            </div>
          </div>
          <div className="mt-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                formInfo.is_open
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${formInfo.is_open ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
              {formInfo.is_open ? "Formulaire Ouvert" : "Formulaire Fermé"}
            </span>
            <p className="text-[11px] text-slate-600 mt-0.5 truncate" title={checkinFullUrl}>
              /checkin/{activity.id}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-orange-100">
        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Onglets de l'activité">
          <button
            onClick={() => setActiveTab("presences")}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              activeTab === "presences"
                ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                : "bg-white text-orange-800 hover:bg-orange-100"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Liste des présences & Inscrits</span>
            <span className="ml-1.5 py-0.5 px-2 rounded-full text-xs bg-slate-100 text-slate-700 font-semibold">
              {participants.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("formulaire")}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              activeTab === "formulaire"
                ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                : "bg-white text-orange-800 hover:bg-orange-100"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Détail du Formulaire & Inscriptions</span>
            {formInfo.linked_form && (
              <span className="ml-1 py-0.5 px-1.5 rounded text-[10px] bg-slate-100 text-slate-600">Lié</span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("checklist")}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              activeTab === "checklist"
                ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                : "bg-white text-orange-800 hover:bg-orange-100"
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Checklist</span>
            {tasks.length > 0 && (
              <span
                className={`ml-1.5 py-0.5 px-2 rounded-full text-xs font-semibold ${
                  taskStats.done === taskStats.total
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {taskStats.done}/{taskStats.total}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("infos")}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${
              activeTab === "infos"
                ? "bg-orange-500 text-white shadow-md shadow-orange-200"
                : "bg-white text-orange-800 hover:bg-orange-100"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Informations & Documents ({photos?.length || 0})</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: LISTE DES PRÉSENCES */}
      {activeTab === "presences" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="card p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, prénom, email, téléphone, école..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-9 text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                className="select text-xs py-2"
              >
                <option value="all">Tous les genres</option>
                <option value="F">Femmes uniquement</option>
                <option value="H">Hommes uniquement</option>
              </select>

              <select
                value={attestationFilter}
                onChange={(e) => setAttestationFilter(e.target.value)}
                className="select text-xs py-2"
              >
                <option value="all">Toutes les attestations</option>
                <option value="sent">Attestation envoyée</option>
                <option value="pending">En attente d&apos;envoi</option>
              </select>

              <button
                onClick={openAddModal}
                className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead className="table-head">
                  <tr>
                    <th className="p-3 text-left">Participant</th>
                    <th className="p-3 text-left">Contact</th>
                    <th className="p-3 text-left">Genre & Âge</th>
                    <th className="p-3 text-left">Structure / École</th>
                    <th className="p-3 text-left">Statut</th>
                    <th className="p-3 text-left">Attestation</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        {participants.length === 0 ? (
                          <div className="space-y-2">
                            <Users className="w-8 h-8 text-slate-300 mx-auto" />
                            <p className="font-medium text-slate-700">Aucun participant inscrit pour l&apos;instant</p>
                            <p className="text-xs text-slate-500">
                              Partagez le QR code ou le lien d&apos;émargement aux participants, ou ajoutez-les manuellement.
                            </p>
                            <button
                              onClick={openAddModal}
                              className="btn-secondary text-xs inline-flex items-center gap-1 mt-2"
                            >
                              <Plus className="w-3.5 h-3.5" /> Inscrire un premier participant
                            </button>
                          </div>
                        ) : (
                          <p>Aucun participant ne correspond à votre recherche.</p>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p) => (
                      <tr key={p.id} className="table-row group hover:bg-orange-50/30 transition-colors">
                        <td className="p-3">
                          <Link
                            to={`/participants/${p.id}`}
                            className="font-semibold text-slate-900 group-hover:text-orange-600 flex items-center gap-1.5"
                            title="Voir le profil complet et l'historique de ce participant"
                          >
                            <span>{p.nom} {p.prenom}</span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-orange-500" />
                          </Link>
                          {p.interet_stage && (
                            <span className="inline-block mt-0.5 text-[10px] font-semibold text-orange-700 bg-orange-50 px-1.5 py-0.2 rounded border border-orange-200">
                              ★ Candidat Stage
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          {p.email ? (
                            <a href={`mailto:${p.email}`} className="text-slate-600 hover:text-orange-600 block truncate max-w-[200px]">
                              {p.email}
                            </a>
                          ) : (
                            <span className="text-slate-400 italic">Pas d&apos;email</span>
                          )}
                          {p.telephone ? (
                            <span className="text-slate-500 block mt-0.5">{p.telephone}</span>
                          ) : null}
                        </td>
                        <td className="p-3 text-xs">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium mr-1.5 ${
                              p.genre === "F"
                                ? "bg-orange-100 text-orange-700"
                                : p.genre === "H"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {p.genre === "F" ? "Femme" : p.genre === "H" ? "Homme" : p.genre || "—"}
                          </span>
                          <span className="text-slate-500">{p.age_range || "—"}</span>
                        </td>
                        <td className="p-3 text-xs text-slate-600 max-w-[160px] truncate" title={p.structure}>
                          {p.structure || "—"}
                        </td>
                        <td className="p-3 text-xs text-slate-600">
                          {p.statut || "Participant"}
                        </td>
                        <td className="p-3 text-xs">
                          {p.attestation_envoyee_le ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Reçue
                            </span>
                          ) : (
                            <span className="text-slate-400">Non envoyée</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Link
                              to={`/participants/${p.id}`}
                              className="p-1.5 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              title="Consulter le profil et parcours complet du jeune"
                            >
                              <User className="w-4 h-4" />
                            </Link>
                            {!isViewer && (
                              <button
                                onClick={() => handleRemoveParticipant(p)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Retirer de cette activité"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Affichage de {filteredParticipants.length} sur {participants.length} participant(s)</span>
              <span>Cliquez sur un participant pour ouvrir son historique complet</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DÉTAIL DU FORMULAIRE */}
      {activeTab === "formulaire" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Form Info and Fields */}
          <div className="lg:col-span-2 space-y-6">
            {/* Live Checkin Form Status Box */}
            <div className="card p-5 space-y-4 border-l-4 border-l-orange-500">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Formulaire d&apos;émargement en ligne</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Utilisé par les participants sur leur smartphone ou sur place via QR Code
                  </p>
                </div>
                <span
                  className={`badge font-semibold ${
                    formInfo.is_open ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {formInfo.is_open ? "Ouvert aux inscriptions" : "Émargement Fermé"}
                </span>
              </div>

              {/* Public Link Box */}
              <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-xs font-mono text-slate-600 flex-1 truncate">
                  {checkinFullUrl}
                </span>
                <button
                  onClick={copyCheckinLink}
                  className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1"
                >
                  {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{linkCopied ? "Copié !" : "Copier"}</span>
                </button>
                <a
                  href={checkinFullUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost border text-xs py-1.5 px-2.5 flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Tester</span>
                </a>
              </div>
            </div>

            {/* Standard Form Schema Inspection */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Configuration des champs du formulaire</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Champs exigés pour la validation de présence et la création de la fiche participant
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {formInfo.standard_fields?.length || 0} champs
                </span>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {formInfo.standard_fields?.map((f, idx) => (
                  <div key={f.key || idx} className="p-3.5 bg-white flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800">{f.label}</span>
                        {f.required ? (
                          <span className="text-[10px] font-bold text-red-600 uppercase">Obligatoire</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Optionnel</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="badge bg-slate-100 text-slate-700 text-xs font-mono">
                        {f.type}
                      </span>
                      {f.options && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {f.options.length} options disponibles
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form Submissions Received */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Historique des émargements en temps réel</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Dernières soumissions enregistrées depuis le formulaire
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-medium">
                  {formInfo.checkin_logs?.length || 0} enregistrements
                </span>
              </div>

              {formInfo.checkin_logs?.length === 0 ? (
                <div className="p-6 text-center text-slate-500 border border-dashed rounded-xl">
                  <p className="text-sm">Aucun émargement reçu pour l&apos;instant</p>
                  <p className="text-xs text-slate-400 mt-1">Les présences soumises en ligne apparaîtront ici avec horodatage</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                  {formInfo.checkin_logs.map((log) => {
                    const d = typeof log.details === "string" ? JSON.parse(log.details) : log.details || {};
                    return (
                      <div key={log.id} className="p-3 text-xs flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-800">
                            Participant #{d.participant_id || log.resource_label}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Via {d.via || "formulaire public"} • {d.fiche_existante ? "Fiche existante mise à jour" : "Nouvelle fiche créée"}
                          </p>
                        </div>
                        <span className="text-slate-400 shrink-0 font-mono">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Column 3: QR Code & Custom Dynamic Form Link */}
          <div className="space-y-6">
            {/* QR Card */}
            <div className="card p-5 text-center space-y-4">
              <h3 className="font-bold text-slate-900 text-sm">QR Code d&apos;émargement</h3>
              <p className="text-xs text-slate-500">
                À projeter en salle ou à imprimer pour la session
              </p>

              <div className="flex justify-center my-2">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="w-48 h-48 rounded-xl border border-slate-200 shadow-sm"
                  />
                ) : (
                  <div className="w-48 h-48 rounded-xl bg-slate-100 flex items-center justify-center">
                    <QrCode className="w-12 h-12 text-slate-400" />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleDownloadQr}
                  className="btn-primary w-full text-xs flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Télécharger en haute résolution</span>
                </button>
                <button
                  onClick={copyCheckinLink}
                  className="btn-secondary w-full text-xs flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copier le lien public</span>
                </button>
              </div>
            </div>

            {/* Link Custom Form from Forms Module */}
            {role === "admin" && (
              <div className="card p-5 space-y-3">
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-orange-500" />
                  Formulaire personnalisé associé
                </h3>
                <p className="text-xs text-slate-500">
                  Associez un questionnaire d&apos;évaluation, de satisfaction ou de sélection créé dans le module Formulaires.
                </p>

                <select
                  value={selectedFormId}
                  onChange={(e) => setSelectedFormId(e.target.value)}
                  className="select text-xs w-full"
                >
                  <option value="">Aucun formulaire lié</option>
                  {availableForms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.title} ({f.status})
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleSaveLinkedForm}
                  disabled={savingFormLink}
                  className="btn-primary w-full text-xs disabled:opacity-60"
                >
                  {savingFormLink ? "Enregistrement..." : "Enregistrer l'association"}
                </button>

                {formInfo.linked_form && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <p className="font-semibold text-xs text-slate-900">{formInfo.linked_form.title}</p>
                    <p className="text-[11px] text-slate-600">
                      {formInfo.linked_form_submissions?.length || 0} réponse(s) reçue(s)
                    </p>
                    <a
                      href={`/f/${formInfo.linked_form.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-medium text-orange-700 hover:underline inline-flex items-center gap-1"
                    >
                      Voir le formulaire public <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: CHECKLIST */}
      {activeTab === "checklist" && (
        <div className="space-y-4">
          {/* Avancement */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-orange-500" />
                  Checklist de l&apos;activité
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {taskStats.total === 0
                    ? "Aucune tâche pour l'instant : ajoutez les étapes d'organisation."
                    : `${taskStats.done} tâche(s) terminée(s) sur ${taskStats.total}.`}
                </p>
              </div>
              {!isViewer && (
                <button
                  onClick={() => openTaskForm()}
                  className="btn-primary text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Ajouter une tâche
                </button>
              )}
            </div>

            {taskStats.total > 0 && (
              <div className="mt-4">
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: `${taskStats.percent}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {taskStats.percent}% d&apos;avancement
                </p>
              </div>
            )}
          </div>

          {/* Création / modification d'une tâche */}
          {taskForm && !isViewer && (
            <form onSubmit={saveTask} className="space-y-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/70 to-white p-4 shadow-sm sm:p-5">
              <h4 className="font-semibold text-slate-900 text-sm">
                {taskForm.id ? "Modifier la tâche" : "Nouvelle tâche"}
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Intitulé *
                  </label>
                  <input
                    type="text"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex : Réserver la salle et le matériel"
                    className="input"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Responsable
                  </label>
                  <select
                    value={taskForm.assigned_to}
                    onChange={(e) => setTaskForm((f) => ({ ...f, assigned_to: e.target.value }))}
                    className="select"
                  >
                    <option value="">Non affectée</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name || m.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Date limite
                  </label>
                  <input
                    type="date"
                    value={taskForm.due_date}
                    onChange={(e) => setTaskForm((f) => ({ ...f, due_date: e.target.value }))}
                    className="input"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">État</label>
                  <div className="flex flex-wrap gap-2">
                    {TASK_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setTaskForm((f) => ({ ...f, status: s.value }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          taskForm.status === s.value
                            ? `${TASK_STATUS_STYLE[s.value].solid} border-transparent`
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Note (facultatif)
                  </label>
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    placeholder="Précisions utiles à la personne en charge..."
                    className="input"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTaskForm(null)}
                  className="btn-secondary text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingTask}
                  className="btn-primary text-sm disabled:opacity-60"
                >
                  {savingTask
                    ? "Enregistrement..."
                    : taskForm.id
                    ? "Enregistrer"
                    : "Ajouter"}
                </button>
              </div>
            </form>
          )}

          {/* Liste des tâches */}
          {tasksLoading ? (
            <div className="card p-8 text-center text-slate-500 text-sm">
              Chargement de la checklist...
            </div>
          ) : tasks.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 border border-dashed">
              <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm">Aucune tâche pour cette activité.</p>
              {!isViewer && (
                <button
                  onClick={() => openTaskForm()}
                  className="btn-primary text-sm mt-3"
                >
                  <Plus className="w-4 h-4" />
                  Créer la première tâche
                </button>
              )}
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="bg-orange-50 text-left text-xs uppercase tracking-wider text-orange-800">
                      <th className="px-4 py-3.5 font-bold">Tâche</th>
                      <th className="w-52 px-4 py-3.5 font-bold">Responsable</th>
                      <th className="w-40 px-4 py-3.5 font-bold">Échéance</th>
                      <th className="w-40 px-4 py-3.5 font-bold">État</th>
                      {!isViewer && (
                        <th className="w-24 px-4 py-3.5 text-right font-bold">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tasks.map((task) => {
                      const overdue =
                        task.due_date &&
                        task.status !== "termine" &&
                        new Date(task.due_date) < new Date(new Date().toDateString());
                      const style = TASK_STATUS_STYLE[task.status] || TASK_STATUS_STYLE.a_faire;
                      return (
                        <tr key={task.id} className="transition-colors odd:bg-white even:bg-slate-50/60 hover:bg-orange-50">
                          <td className="px-4 py-3 align-middle">
                            <p
                              className={`font-semibold ${
                                task.status === "termine"
                                  ? "text-slate-400 line-through"
                                  : "text-slate-800"
                              }`}
                            >
                              {task.title}
                            </p>
                            {task.description && (
                              <p
                                className="mt-0.5 max-w-[360px] truncate text-xs text-slate-500"
                                title={task.description}
                              >
                                {task.description}
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-3 align-middle">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs ${
                                task.assigned_name ? "text-slate-600" : "text-slate-400"
                              }`}
                            >
                              <User className="w-3.5 h-3.5" />
                              {task.assigned_name || "Non affectée"}
                            </span>
                          </td>

                          <td className="px-4 py-3 align-middle">
                            {task.due_date ? (
                              <span
                                className={`inline-flex items-center gap-1.5 text-xs ${
                                  overdue ? "font-semibold text-red-600" : "text-slate-600"
                                }`}
                              >
                                <Clock className="w-3.5 h-3.5" />
                                {formatDate(task.due_date)}
                                {overdue && (
                                  <span className="text-[10px] font-bold uppercase">retard</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 align-middle">
                            {isViewer ? (
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${style.chip}`}
                              >
                                {taskStatusLabel(task.status)}
                              </span>
                            ) : (
                              <select
                                value={task.status}
                                onChange={(e) => changeTaskStatus(task, e.target.value)}
                                className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-semibold focus:outline-none ${style.chip}`}
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
                            <td className="px-4 py-3 align-middle">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openTaskForm(task)}
                                  title="Modifier"
                                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTask(task)}
                                  title="Supprimer"
                                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INFORMATIONS & DOCUMENTS */}
      {activeTab === "infos" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Details Card */}
          <div className="card p-5 space-y-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-500" />
              Détails complets de l&apos;activité
            </h3>

            <dl className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Titre</dt>
                <dd className="font-semibold text-slate-800">{activity.title}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Date de début</dt>
                <dd className="text-slate-800">{formatDate(activity.activity_date)}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Date de fin</dt>
                <dd className="text-slate-800">{formatDate(activity.date_fin) || "Même jour"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Durée totale</dt>
                <dd className="text-slate-800">{activity.duration_hours ? `${activity.duration_hours} heures` : "Non spécifiée"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Lieu / Région</dt>
                <dd className="text-slate-800">{activity.location || "Non spécifié"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Dispositif ODC</dt>
                <dd className="text-slate-800">{activity.device_name || "—"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Partenaire conventionné</dt>
                <dd className="text-slate-800">{activity.partner_name || "—"}</dd>
              </div>
              <div className="py-2.5 flex justify-between">
                <dt className="text-slate-500 font-medium">Coach / Responsable</dt>
                <dd className="text-slate-800">{activity.coach_name || "Équipe ODC"}</dd>
              </div>
            </dl>
          </div>

          {/* Photos & Report Card */}
          <div className="space-y-6">
            {/* Activity Photos Gallery */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Camera className="w-5 h-5 text-orange-500" />
                  Photos de l&apos;activité ({photos?.length || 0})
                </h3>
                {!isViewer && (
                  <label className="btn-secondary text-xs py-1.5 px-2.5 cursor-pointer flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingPhoto ? "Ajout..." : "Ajouter une photo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {photos?.length === 0 ? (
                <div className="p-8 text-center text-slate-500 border border-dashed rounded-xl">
                  <Camera className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                  <p className="text-xs">Aucune photo enregistrée pour cette séance</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((ph, index) => (
                    <button
                      type="button"
                      key={ph.id}
                      onClick={() => setLightbox(index)}
                      className="group relative rounded-xl overflow-hidden aspect-video bg-slate-100 border cursor-zoom-in"
                    >
                      <img
                        src={`${api.defaults.baseURL || ""}/activities/${id}/photos/${ph.id}`}
                        alt={ph.filename}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Activity Report — Génération + gestion */}
            <div className="card p-5 space-y-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-500" />
                Rapport d&apos;activité
              </h3>

              {/* Rapport existant (généré ou uploadé) */}
              {activity.report_filename ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {renaming === "report" ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              autoFocus
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") submitRename();
                                if (e.key === "Escape") cancelRename();
                              }}
                              className="text-xs font-semibold text-slate-900 rounded-lg border border-orange-300 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-100 w-full max-w-[200px]"
                              placeholder="Nom du rapport"
                            />
                            <span className="text-[10px] text-slate-400">.pdf</span>
                            <button
                              type="button"
                              onClick={submitRename}
                              disabled={renameSaving}
                              className="icon-btn h-7 w-7 hover:bg-orange-100"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelRename}
                              className="icon-btn h-7 w-7"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-slate-700 truncate max-w-[200px]">
                              {activity.report_filename}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              Rapport disponible
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={openReportPreview}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Visualiser
                    </button>
                    <a
                      href={`${api.defaults.baseURL || ""}/activities/${id}/report`}
                      download
                      className="btn text-xs py-1.5 px-3 flex items-center gap-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Télécharger
                    </a>
                    {!isViewer && (
                      <button
                        type="button"
                        onClick={() => startRename("report", activity.report_filename)}
                        disabled={renaming === "report"}
                        className="btn text-xs py-1.5 px-3 flex items-center gap-1.5 bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Renommer
                      </button>
                    )}
                    {!isViewer && (
                      <button
                        type="button"
                        onClick={handleDeleteReport}
                        disabled={deletingReport}
                        className="btn text-xs py-1.5 px-3 flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingReport ? "Suppression..." : "Supprimer"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-center">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">
                    Aucun rapport. Générez-en un ci-dessous depuis les données de l&apos;activité.
                  </p>
                </div>
              )}

              {/* Génération de rapport */}
              {!isViewer && (
                <div className="rounded-xl border border-orange-200/60 bg-orange-50/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {activity.report_filename ? "Mettre à jour le rapport existant" : "Générer un rapport"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {activity.report_filename
                          ? "Le PDF enregistré ne se met pas à jour automatiquement. Régénérez-le pour appliquer le modèle actuel."
                          : "Crée un PDF détaillé directement depuis les données de l'activité."}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Type de rapport
                    </label>
                    <select
                      className="select mt-1"
                      value={reportType}
                      onChange={(e) => {
                        setReportType(e.target.value);
                        if (e.target.value === "rapport_synthese") setReferenceFile(null);
                      }}
                    >
                      {REPORT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-500">
                      {REPORT_TYPES.find((t) => t.value === reportType)?.desc}
                    </p>
                  </div>

                  {/* Rapport de référence (optionnel) */}
                  {reportType !== "rapport_synthese" && <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                      <Paperclip className="w-3 h-3" />
                      Rapport de référence (modèle)
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
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setReferenceFile(f);
                          }}
                        />
                        <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500 hover:border-orange-300 hover:bg-orange-50/30 transition-colors">
                          <Upload className="w-3.5 h-3.5" />
                          {referenceFile ? referenceFile.name : "Choisir un PDF…"}
                        </div>
                      </label>
                      {referenceFile && (
                        <button
                          type="button"
                          onClick={() => setReferenceFile(null)}
                          className="icon-btn icon-btn-danger h-8 w-8"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>}

                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={generatingReport}
                    className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {generatingReport ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Génération en cours...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        {activity.report_filename ? "Régénérer au format actuel" : "Générer le rapport"}
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: APERÇU DU RAPPORT PDF */}
      {reportPreview.open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-semibold text-slate-800 truncate">
                  {activity.report_filename}
                </span>
              </div>
              <button
                type="button"
                onClick={closeReportPreview}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100">
              {reportPreview.loading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
                  <p className="text-xs font-medium">Chargement du rapport...</p>
                </div>
              ) : reportPreview.error ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 text-red-600 p-6 text-center">
                  <AlertTriangle className="w-8 h-8" />
                  <p className="text-sm">{reportPreview.error}</p>
                </div>
              ) : (
                <iframe
                  src={reportPreview.url}
                  title="Aperçu du rapport"
                  className="w-full h-full"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PHOTO PLEIN ÉCRAN */}
      {lightbox >= 0 && photosList[lightbox] && (
        <div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 animate-in fade-in"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <X className="w-7 h-7" />
          </button>

          {photosList.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showPrevPhoto();
                }}
                className="absolute left-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
              >
                <ChevronLeft className="w-7 h-7" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showNextPhoto();
                }}
                className="absolute right-4 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20"
              >
                <ChevronRight className="w-7 h-7" />
              </button>
            </>
          )}

          <figure
            className="max-w-5xl max-h-[85vh] flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={`${api.defaults.baseURL || ""}/activities/${id}/photos/${photosList[lightbox].id}`}
              alt={photosList[lightbox].filename}
              className="max-h-[78vh] max-w-full object-contain rounded-xl"
            />
            <figcaption className="text-white/70 text-xs">
              {photosList[lightbox].filename} — {lightbox + 1} / {photosList.length}
            </figcaption>
          </figure>
        </div>
      )}

      {/* MODAL: QR CODE */}
      {qrModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="card-solid max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold text-orange-600">QR Code Présence</span>
              <button onClick={() => setQrModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <h4 className="font-bold text-slate-900 text-lg">{activity.title}</h4>

            {qrDataUrl && (
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-60 h-60 mx-auto rounded-2xl border border-slate-200 shadow-md p-2 bg-white"
              />
            )}

            <p className="text-xs text-slate-500">
              Les bénéficiaires scannent ce QR code pour accéder directement au formulaire d&apos;émargement.
            </p>

            <div className="space-y-2 pt-2">
              <button onClick={handleDownloadQr} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                <span>Télécharger l&apos;image PNG</span>
              </button>
              <button onClick={copyCheckinLink} className="btn-ghost border w-full text-sm flex items-center justify-center gap-2">
                <Copy className="w-4 h-4" />
                <span>Copier le lien public</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AJOUT PARTICIPANT */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="card-solid max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Inscrire un participant</h3>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode selection tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAddMode("new")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  addMode === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                Nouveau participant
              </button>
              <button
                type="button"
                onClick={() => setAddMode("existing")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  addMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                Participant déjà enregistré
              </button>
            </div>

            <form onSubmit={handleAddParticipant} className="space-y-3 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/60 to-white p-4">
              {addMode === "existing" ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700">Sélectionner un participant existant</label>
                  <input
                    type="text"
                    placeholder="Filtrer par nom..."
                    value={searchExisting}
                    onChange={(e) => setSearchExisting(e.target.value)}
                    className="input text-xs mb-2"
                  />
                  <div className="max-h-60 overflow-y-auto border rounded-xl divide-y divide-slate-100">
                    {existingParticipants
                      .filter((p) => {
                        if (!searchExisting) return true;
                        const full = `${p.nom} ${p.prenom} ${p.email || ""}`.toLowerCase();
                        return full.includes(searchExisting.toLowerCase());
                      })
                      .map((p) => (
                        <label
                          key={p.id}
                          className={`flex items-center justify-between p-2.5 text-xs cursor-pointer hover:bg-slate-50 ${
                            String(selectedExistingId) === String(p.id) ? "bg-orange-50 font-semibold" : ""
                          }`}
                        >
                          <div>
                            <p className="text-slate-800">{p.nom} {p.prenom}</p>
                            <p className="text-slate-400 text-[11px]">{p.email || p.telephone || "Sans contact"}</p>
                          </div>
                          <input
                            type="radio"
                            name="existingParticipant"
                            value={p.id}
                            checked={String(selectedExistingId) === String(p.id)}
                            onChange={(e) => setSelectedExistingId(e.target.value)}
                            className="accent-orange-500"
                          />
                        </label>
                      ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Nom *</label>
                      <input
                        type="text"
                        required
                        value={newParticipantForm.nom}
                        onChange={(e) => setNewParticipantForm({ ...newParticipantForm, nom: e.target.value })}
                        className="input text-xs mt-1"
                        placeholder="Ex: Ndiaye"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Prénom *</label>
                      <input
                        type="text"
                        required
                        value={newParticipantForm.prenom}
                        onChange={(e) => setNewParticipantForm({ ...newParticipantForm, prenom: e.target.value })}
                        className="input text-xs mt-1"
                        placeholder="Ex: Aminata"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">E-mail</label>
                      <input
                        type="email"
                        value={newParticipantForm.email}
                        onChange={(e) => setNewParticipantForm({ ...newParticipantForm, email: e.target.value })}
                        className="input text-xs mt-1"
                        placeholder="aminata@example.com"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Téléphone</label>
                      <input
                        type="tel"
                        value={newParticipantForm.telephone}
                        onChange={(e) => setNewParticipantForm({ ...newParticipantForm, telephone: e.target.value })}
                        className="input text-xs mt-1"
                        placeholder="77 000 00 00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Genre</label>
                      <select
                        value={newParticipantForm.genre}
                        onChange={(e) => setNewParticipantForm({ ...newParticipantForm, genre: e.target.value })}
                        className="select text-xs mt-1"
                      >
                        <option value="F">Femme</option>
                        <option value="H">Homme</option>
                        <option value="Autre">Autre</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700">Tranche d&apos;âge</label>
                      <select
                        value={newParticipantForm.age_range}
                        onChange={(e) => setNewParticipantForm({ ...newParticipantForm, age_range: e.target.value })}
                        className="select text-xs mt-1"
                      >
                        <option value="Moins de 18 ans">Moins de 18 ans</option>
                        <option value="18-25 ans">18-25 ans</option>
                        <option value="26-35 ans">26-35 ans</option>
                        <option value="36-45 ans">36-45 ans</option>
                        <option value="Plus de 45 ans">Plus de 45 ans</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700">Structure / Université</label>
                    <input
                      type="text"
                      value={newParticipantForm.structure}
                      onChange={(e) => setNewParticipantForm({ ...newParticipantForm, structure: e.target.value })}
                      className="input text-xs mt-1"
                      placeholder="Ex: UCAD, ESP, etc."
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="btn-ghost border text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={addingParticipant}
                  className="btn-primary text-xs disabled:opacity-50"
                >
                  {addingParticipant ? "Inscription..." : "Valider l'inscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
