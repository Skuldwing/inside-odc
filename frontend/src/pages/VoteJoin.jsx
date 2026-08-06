import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, Award, AlertCircle, Mail } from "lucide-react";
import api from "../api";

const AVATARS = ["🧑","👩","👨","😎","🤓","🦸","🧙","🎓","🏆","⭐","🚀","💡","🎯","🔥","💪","🌟","🦁","🐯","🦊","🐺"];

export default function VoteJoin() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("🧑");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  /* Mode récupération : l'utilisateur revient sans localStorage */
  const [recovering, setRecovering] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recovering_loading, setRecoveringLoading] = useState(false);
  const [recoverError, setRecoverError] = useState("");

  useEffect(() => {
    const existing = localStorage.getItem(`vote_jury_${sessionId}`);
    if (existing) {
      navigate(`/vote/jury/${sessionId}`, { replace: true });
      return;
    }
    api.get(`/vote/join/${sessionId}`)
      .then(r => setSession(r.data))
      .catch(err => setLoadError(err?.response?.data?.error || "Session introuvable"));
  }, [sessionId, navigate]);

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!pseudo.trim()) return;
    setJoining(true);
    setJoinError("");
    try {
      const r = await api.post(`/vote/join/${sessionId}`, {
        pseudo: pseudo.trim(),
        avatar,
        email: email.trim() || undefined,
      });
      localStorage.setItem(`vote_jury_${sessionId}`, JSON.stringify({
        token: r.data.token,
        pseudo: r.data.pseudo,
        avatar: r.data.avatar,
        email: email.trim() || undefined,
      }));
      navigate(`/vote/jury/${sessionId}`, { replace: true });
    } catch (err) {
      setJoinError(err?.response?.data?.error || "Erreur. Réessayez.");
      setJoining(false);
    }
  };

  /* Récupération de session par email uniquement */
  const handleRecover = async (e) => {
    e.preventDefault();
    if (!recoverEmail.trim()) return;
    setRecoveringLoading(true);
    setRecoverError("");
    try {
      const r = await api.post(`/vote/recover/${sessionId}`, { email: recoverEmail.trim() });
      localStorage.setItem(`vote_jury_${sessionId}`, JSON.stringify({
        token: r.data.token,
        pseudo: r.data.pseudo,
        avatar: r.data.avatar,
        email: recoverEmail.trim(),
      }));
      navigate(`/vote/jury/${sessionId}`, { replace: true });
    } catch (err) {
      if (err?.response?.status === 403) {
        setRecoverError(err.response.data?.error || "Session non disponible.");
      } else {
        setRecoverError("Adresse email non trouvée dans cette session.");
      }
      setRecoveringLoading(false);
    }
  };

  if (!session && !loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <p className="text-lg font-semibold text-slate-700">Session indisponible</p>
        <p className="text-sm text-slate-500 mt-1">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 mb-4 shadow-lg shadow-orange-200">
            <Award className="w-8 h-8 text-white" />
          </div>
          <p className="text-xs uppercase tracking-widest text-orange-500 font-semibold mb-1">Jury</p>
          <h1 className="text-2xl font-bold text-slate-900">{session.name}</h1>
          {session.event_date && (
            <p className="text-sm text-slate-500 mt-1">
              {new Date(session.event_date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          )}
        </div>

        {recovering ? (
          /* ── Mode récupération de session ── */
          <form onSubmit={handleRecover} className="space-y-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-orange-500" />
                <p className="font-semibold text-sm text-slate-800">Retrouver ma session</p>
              </div>
              <p className="text-xs text-slate-400 mb-4">Entrez l&apos;adresse email utilisée lors de votre inscription.</p>
              <input
                required
                autoFocus
                type="email"
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="votre@email.com"
                value={recoverEmail}
                onChange={e => setRecoverEmail(e.target.value)}
              />
            </div>

            {recoverError && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {recoverError}
              </div>
            )}

            <button
              type="submit"
              disabled={recovering_loading || !recoverEmail.trim()}
              className="w-full rounded-2xl bg-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {recovering_loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Recherche...
                </span>
              ) : "Retrouver ma session"}
            </button>

            <button
              type="button"
              onClick={() => { setRecovering(false); setRecoverError(""); }}
              className="w-full rounded-2xl border border-slate-200 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              ← Retour
            </button>
          </form>
        ) : (
          /* ── Formulaire d'inscription ── */
          <form onSubmit={handleJoin} className="space-y-5">
            {/* Avatar picker */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3 block">Votre avatar</label>
              <div className="grid grid-cols-5 gap-2">
                {AVATARS.map(em => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setAvatar(em)}
                    className={`text-2xl h-11 rounded-xl transition-all ${avatar === em ? "bg-orange-100 ring-2 ring-orange-400 scale-110" : "hover:bg-slate-100"}`}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            {/* Pseudo */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2 block">Votre pseudo</label>
              <input
                required
                autoFocus
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="Ex: Amadou D."
                value={pseudo}
                onChange={e => setPseudo(e.target.value)}
                maxLength={50}
              />
            </div>

            {/* Email */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1 block">
                Adresse email <span className="text-slate-300 font-normal normal-case">(recommandé)</span>
              </label>
              <p className="text-xs text-slate-400 mb-2">Permet de retrouver votre session si vous changez d&apos;appareil.</p>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
                placeholder="votre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            {joinError && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {joinError}
              </div>
            )}

            {/* Preview + submit */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex items-center gap-3">
              <span className="text-3xl">{avatar}</span>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 text-sm">{pseudo || "Votre nom..."}</p>
                <p className="text-xs text-slate-400">Membre du jury</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={joining || !pseudo.trim()}
              className="w-full rounded-2xl bg-orange-500 py-4 text-base font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Connexion...
                </span>
              ) : "Rejoindre comme juré"}
            </button>

            {/* Lien récupération */}
            <p className="text-center text-xs text-slate-400">
              Déjà inscrit ?{" "}
              <button
                type="button"
                onClick={() => { setRecovering(true); setJoinError(""); }}
                className="text-orange-500 hover:underline font-medium"
              >
                Retrouver ma session
              </button>
            </p>

            <p className="text-center text-xs text-slate-400 pb-4">Orange Digital Center Senegal</p>
          </form>
        )}
      </div>
    </div>
  );
}
