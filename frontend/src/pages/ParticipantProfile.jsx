import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  User,
  Calendar,
  Clock,
  Award,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building,
  Briefcase,
  Sparkles,
  ExternalLink,
  Edit3,
  Save,
  ThumbsUp,
  GraduationCap,
  ChevronRight,
  RefreshCw,
  Star,
  Check,
  Send,
  Download,
  Eye,
  X,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";
import { useToast } from "../components/ui";

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

export default function ParticipantProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { role, isViewer } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("activites"); // 'activites' | 'formulaires' | 'recommandation'

  // Notes & stage interest edit state
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [interetStage, setInteretStage] = useState(false);

  // Form Submission Viewer Modal
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get(`/participants/${id}`);
      setData(res.data);
      setNotes(res.data?.participant?.notes || "");
      setInteretStage(Boolean(res.data?.participant?.interet_stage));
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || "Erreur de chargement du profil participant.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchProfile();
    }
  }, [id]);

  const handleSaveNotes = async () => {
    try {
      setSavingNotes(true);
      await api.patch(`/participants/${id}`, { notes, interet_stage: interetStage });
      toast.success("Notes et statut de stage enregistrés avec succès !");
      fetchProfile();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de la sauvegarde.");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleToggleStage = async () => {
    const nextVal = !interetStage;
    setInteretStage(nextVal);
    try {
      await api.patch(`/participants/${id}`, { interet_stage: nextVal });
      toast.success(nextVal ? "Participant marqué comme candidat stage !" : "Statut stage retiré.");
      fetchProfile();
    } catch (err) {
      toast.error(err?.response?.data?.error || "Erreur lors de la mise à jour.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="w-8 h-8 text-orange-500 animate-spin" />
        <p className="text-sm font-medium text-slate-500">Chargement du parcours du participant...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 rounded-2xl bg-red-50 border border-red-200 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-red-900 mb-2">Participant introuvable</h2>
        <p className="text-sm text-red-700 mb-6">{error || "Ce participant n'existe pas ou a été déplacé."}</p>
        <button onClick={() => navigate("/participants")} className="btn-primary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour à la liste des participants
        </button>
      </div>
    );
  }

  const { participant, activities, forms, engagement } = data;

  // Clean initials for avatar
  const initials = `${participant.prenom?.[0] || ""}${participant.nom?.[0] || ""}`.toUpperCase() || "ODC";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/participants")}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Retour aux participants
        </button>

        <div className="flex items-center gap-2">
          {participant.email && (
            <a
              href={`mailto:${participant.email}?subject=Opportunité de stage Orange Digital Center`}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
            >
              <Mail className="w-3.5 h-3.5 text-orange-500" />
              <span>Proposer une opportunité</span>
            </a>
          )}
          {participant.telephone && (
            <a
              href={`https://wa.me/${participant.telephone.replace(/\s+/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 text-emerald-700 hover:text-emerald-800"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>WhatsApp / Contact</span>
            </a>
          )}
        </div>
      </div>

      {/* Hero Profile Card */}
      <section className="surface-glass p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start gap-6">
          {/* Avatar */}
          <div
            className={`w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-2xl md:text-3xl font-extrabold shadow-sm shrink-0 ${
              participant.genre === "F"
                ? "bg-pink-100 text-pink-700 border-2 border-pink-200"
                : participant.genre === "H"
                ? "bg-blue-100 text-blue-700 border-2 border-blue-200"
                : "bg-orange-100 text-orange-700 border-2 border-orange-200"
            }`}
          >
            {initials}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 leading-tight">
                {participant.prenom} {participant.nom}
              </h1>

              {/* Engagement Level Badge */}
              <span
                className={`badge font-semibold text-xs py-0.5 px-2.5 ${
                  engagement.level === "Très engagé(e)"
                    ? "bg-purple-100 text-purple-800 border-purple-200"
                    : engagement.level === "Régulier"
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {engagement.level}
              </span>

              {/* Internship candidate flag */}
              {interetStage ? (
                <span className="badge bg-amber-100 text-amber-800 border-amber-300 font-semibold inline-flex items-center gap-1">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  Candidat Stage & Insertion
                </span>
              ) : null}
            </div>

            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
              {participant.structure && (
                <span className="flex items-center gap-1 text-slate-700 font-medium">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  {participant.structure}
                </span>
              )}
              {participant.email && (
                <a href={`mailto:${participant.email}`} className="flex items-center gap-1 text-slate-600 hover:text-orange-600">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {participant.email}
                </a>
              )}
              {participant.telephone && (
                <span className="flex items-center gap-1 text-slate-600">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {participant.telephone}
                </span>
              )}
              {participant.genre && (
                <span className="flex items-center gap-1">
                  Genre : <strong className="text-slate-700">{participant.genre === "F" ? "Femme" : participant.genre === "H" ? "Homme" : participant.genre}</strong>
                </span>
              )}
              {participant.age_range && (
                <span className="flex items-center gap-1">
                  Tranche d&apos;âge : <strong className="text-slate-700">{participant.age_range}</strong>
                </span>
              )}
            </p>

            {/* Quick summary of tracks followed */}
            {engagement.devices?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">Dispositifs fréquentés :</span>
                {engagement.devices.map((dev) => (
                  <span key={dev} className="badge bg-white border border-slate-200 text-slate-700 text-xs">
                    {dev}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Internship toggle */}
          <div className="shrink-0 flex flex-col items-end gap-2">
            <button
              onClick={handleToggleStage}
              className={`btn-ghost border text-xs py-2 px-3 flex items-center gap-1.5 transition-colors ${
                interetStage
                  ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Star className={`w-4 h-4 ${interetStage ? "fill-amber-500 text-amber-500" : "text-slate-400"}`} />
              <span>{interetStage ? "Candidat stage (Actif)" : "Proposer comme candidat stage"}</span>
            </button>
            <span className="text-[11px] text-slate-400">
              Inscrit depuis le {formatDate(engagement.first_activity_date || participant.created_at)}
            </span>
          </div>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs uppercase font-semibold tracking-wider">Activités suivies</span>
            <Calendar className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">{engagement.total_activities}</p>
          <p className="text-xs text-slate-500 mt-1">Formations & ateliers</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs uppercase font-semibold tracking-wider">Heures de formation</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">{engagement.total_hours}h</p>
          <p className="text-xs text-slate-500 mt-1">Volume horaire cumulé</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs uppercase font-semibold tracking-wider">Formulaires remplis</span>
            <FileText className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">{forms.total_forms}</p>
          <p className="text-xs text-slate-500 mt-1">Émargements et réponses</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs uppercase font-semibold tracking-wider">Attestations reçues</span>
            <Award className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">{engagement.attestations_count}</p>
          <p className="text-xs text-slate-500 mt-1">Certificats de participation</p>
        </div>
      </div>

      {/* Internship & Recruiter Notes Section */}
      <section className="card p-5 border-l-4 border-l-purple-500 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Analyse du parcours & Recommandation Opportunités / Stages
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Cette vue consolidée permet à l&apos;équipe ODC et aux partenaires de repérer les jeunes les plus engagés sur la durée pour leur proposer des opportunités concrètes (stages, alternances, mentorats).
            </p>
          </div>
          <span
            className={`badge font-bold shrink-0 ${
              engagement.eligible_stage ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
            }`}
          >
            {engagement.eligible_stage ? "✓ Profil Recommandé" : "En cours de suivi"}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200/60 text-xs text-purple-900 leading-relaxed">
          <strong>Avis système : </strong> {engagement.recommendation}
        </div>

        {/* Recruiter / Coordinator Notes */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Edit3 className="w-3.5 h-3.5 text-slate-400" />
            Notes d&apos;orientation & Évaluation pour stages (visibles uniquement par l&apos;équipe ODC)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ajoutez des notes sur ce jeune : compétences démontrées, motivation, projets réalisés, domaine de stage recherché..."
            className="input text-xs w-full leading-relaxed"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="btn-primary text-xs flex items-center gap-1.5 py-1.5 px-3 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingNotes ? "Enregistrement..." : "Enregistrer la note"}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6" aria-label="Onglets du profil">
          <button
            onClick={() => setActiveTab("activites")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === "activites"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Historique complet des activités ({activities.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("formulaires")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === "formulaires"
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Formulaires & Émargements remplis ({forms.total_forms})</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: HISTORIQUE DES ACTIVITÉS */}
      {activeTab === "activites" && (
        <div className="space-y-4">
          {activities.length === 0 ? (
            <div className="card p-8 text-center text-slate-500 space-y-2">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="font-semibold text-slate-700">Aucune activité enregistrée</p>
              <p className="text-xs text-slate-500">Ce participant n&apos;est rattaché à aucune activité pour le moment.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((a, idx) => (
                <div
                  key={a.id || idx}
                  className="card p-4 hover:border-orange-300 transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/activities/${a.id}`}
                        className="font-bold text-slate-900 hover:text-orange-600 transition-colors text-base"
                      >
                        {a.title}
                      </Link>
                      {a.device_name && (
                        <span className="badge bg-orange-50 border-orange-200 text-orange-700 text-xs font-semibold">
                          {a.device_name}
                        </span>
                      )}
                      {a.mode && (
                        <span className="badge bg-slate-100 text-slate-600 text-[11px]">
                          {a.mode === "ligne" ? "En ligne" : "Présentiel"}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-medium text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-orange-500" />
                        {formatDate(a.activity_date)}
                      </span>
                      {a.duration_hours && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {a.duration_hours}h
                        </span>
                      )}
                      {a.partner_name && (
                        <span className="flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          Partenaire : {a.partner_name}
                        </span>
                      )}
                      {a.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {a.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {a.attestation_envoyee_le ? (
                      <span className="badge bg-emerald-50 border-emerald-200 text-emerald-700 text-xs font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Attestation reçue
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Sans attestation</span>
                    )}

                    <Link
                      to={`/activities/${a.id}`}
                      className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-3"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Détails activité</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: FORMULAIRES REMPLIS */}
      {activeTab === "formulaires" && (
        <div className="space-y-6">
          {/* Section 1: Checkin submissions */}
          <div className="space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Émargements et inscriptions d&apos;activités
            </h3>

            {forms.checkin_submissions?.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Aucun enregistrement d&apos;émargement tracé dans le journal.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {forms.checkin_submissions.map((chk) => {
                  const d = typeof chk.details === "string" ? JSON.parse(chk.details) : chk.details || {};
                  return (
                    <div key={chk.id} className="p-3.5 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-sm text-slate-800">
                          {chk.activity_title || `Activité #${chk.activity_id}`}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Enregistré le {formatDateTime(chk.created_at)} • Source : {d.via || "checkin public"}
                        </p>
                      </div>

                      <Link
                        to={`/activities/${chk.activity_id}`}
                        className="btn-ghost border text-xs py-1 px-2.5 flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Voir la session</span>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Custom Form submissions */}
          <div className="space-y-3 pt-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-600" />
              Réponses aux formulaires personnalisés (Candidatures, Enquêtes, Feedbacks)
            </h3>

            {forms.custom_form_submissions?.length === 0 ? (
              <div className="card p-6 text-center text-slate-500">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                <p className="text-xs">Aucune soumission de formulaire personnalisée trouvée pour ce contact.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {forms.custom_form_submissions.map((sub) => (
                  <div key={sub.id} className="card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{sub.form_title}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Soumis le {formatDateTime(sub.submitted_at)} • Source : {sub.source}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedSubmission(sub)}
                        className="btn-secondary text-xs flex items-center gap-1 py-1 px-2.5"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Voir les réponses complètes</span>
                      </button>
                    </div>

                    {/* Preview of key fields */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(sub.values || {})
                        .slice(0, 6)
                        .map(([k, v]) => (
                          <div key={k} className="truncate">
                            <span className="font-medium text-slate-500">{k}: </span>
                            <span className="text-slate-800 font-semibold">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: SUBMISSION DETAILS */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="card-solid max-w-lg w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <div>
                <h4 className="font-bold text-slate-900 text-base">{selectedSubmission.form_title}</h4>
                <p className="text-xs text-slate-500">Soumission du {formatDateTime(selectedSubmission.submitted_at)}</p>
              </div>
              <button onClick={() => setSelectedSubmission(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {Object.entries(selectedSubmission.values || {}).map(([key, val]) => (
                <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <p className="text-xs font-semibold text-slate-600 capitalize">{key.replace(/_/g, " ")}</p>
                  <p className="text-sm font-medium text-slate-900 mt-1 whitespace-pre-wrap">
                    {Array.isArray(val) ? val.join(", ") : String(val ?? "—")}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t flex justify-end shrink-0">
              <button onClick={() => setSelectedSubmission(null)} className="btn-primary text-xs">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
