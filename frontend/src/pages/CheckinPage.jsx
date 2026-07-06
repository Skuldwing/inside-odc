import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, MapPin, Calendar, Users, Loader2, AlertCircle } from "lucide-react";
import api from "../api";

const GENRES = ["", "F", "H", "Autre"];
const TRANCHES = ["", "Moins de 18 ans", "18-25 ans", "26-35 ans", "36-45 ans", "Plus de 45 ans"];

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function CheckinPage() {
  const { activityId } = useParams();
  const [activity, setActivity] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ nom: "", prenom: "", telephone: "", email: "", genre: "", structure: "", tranche_age: "" });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok, message, already }
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    api.get(`/checkin/${activityId}`)
      .then((r) => setActivity(r.data))
      .catch((err) => setLoadError(err?.response?.data?.error || "Activite introuvable"));
  }, [activityId]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.prenom.trim()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await api.post(`/checkin/${activityId}`, form);
      setResult(res.data);
    } catch (err) {
      const d = err?.response?.data;
      if (d?.already) {
        setResult({ ok: true, message: "Votre presence est deja enregistree pour cette activite.", already: true });
      } else {
        setSubmitError(d?.error || "Erreur. Reessayez.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Chargement ── */
  if (!activity && !loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  /* ── Erreur activité ── */
  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-lg font-semibold text-slate-700">Activite introuvable</p>
        <p className="text-sm text-slate-500 mt-1">{loadError}</p>
      </div>
    );
  }

  /* ── Succès ── */
  if (result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-orange-50 to-white px-4 text-center">
        <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-orange-500" />
        </div>
        <p className="text-xl font-bold text-slate-900 mb-2">
          {result.already ? "Deja enregistre !" : "Presence confirmee !"}
        </p>
        <p className="text-slate-500 text-sm max-w-xs mb-6">{result.message}</p>
        <div className="rounded-2xl border border-orange-200 bg-white px-6 py-4 text-sm text-slate-700 max-w-xs w-full">
          <p className="font-semibold text-orange-600 mb-1">{activity.title}</p>
          <p className="text-slate-400 text-xs">{formatDate(activity.activity_date)}{activity.location ? ` · ${activity.location}` : ""}</p>
        </div>
        <p className="mt-8 text-xs text-slate-400">Orange Digital Center Senegal</p>
      </div>
    );
  }

  /* ── Formulaire check-in ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-8">
      <div className="max-w-md mx-auto">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500 mb-3 shadow-lg shadow-orange-200">
            <Users className="w-7 h-7 text-white" />
          </div>
          <p className="text-xs uppercase tracking-widest text-orange-500 font-semibold mb-1">Check-in</p>
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{activity.title}</h1>
          <div className="flex items-center justify-center gap-3 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(activity.activity_date)}
            </span>
            {activity.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {activity.location}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {activity.participants_count} participant{activity.participants_count !== 1 ? "s" : ""} enregistre{activity.participants_count !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Vos informations</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Prenom *</label>
                <input
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  placeholder="Aminata"
                  value={form.prenom}
                  onChange={(e) => set("prenom", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Nom *</label>
                <input
                  required
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                  placeholder="Diallo"
                  value={form.nom}
                  onChange={(e) => set("nom", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Telephone</label>
              <input
                type="tel"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="77 000 00 00"
                value={form.telephone}
                onChange={(e) => set("telephone", e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Email</label>
              <input
                type="email"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="email@exemple.com"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Genre</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 bg-white"
                  value={form.genre}
                  onChange={(e) => set("genre", e.target.value)}
                >
                  <option value="">—</option>
                  <option value="F">Femme</option>
                  <option value="H">Homme</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Tranche d&apos;age</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 bg-white"
                  value={form.tranche_age}
                  onChange={(e) => set("tranche_age", e.target.value)}
                >
                  {TRANCHES.map((t) => <option key={t} value={t}>{t || "—"}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-600">Structure / Etablissement</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="Universite, entreprise, ecole..."
                value={form.structure}
                onChange={(e) => set("structure", e.target.value)}
              />
            </div>
          </div>

          {submitError && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !form.nom.trim() || !form.prenom.trim()}
            className="w-full rounded-2xl bg-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Enregistrement...
              </span>
            ) : (
              "Confirmer ma presence"
            )}
          </button>

          <p className="text-center text-xs text-slate-400 pb-4">
            Orange Digital Center Senegal · Inside ODC
          </p>
        </form>
      </div>
    </div>
  );
}
