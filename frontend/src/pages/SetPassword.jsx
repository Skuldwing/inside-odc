import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../api";

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Lien invalide.");
      return;
    }
    if (!password || password.length < 6) {
      setError("Mot de passe trop court (6 caractères minimum).");
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      await api.post("/auth/set-password", { token, password });
      setSuccess(true);
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      setError(
        err?.response?.data?.error ||
          "Erreur lors de la définition du mot de passe."
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          <div className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-orange-500/30">
              O
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Définir le mot de passe
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Choisissez un nouveau mot de passe
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl bg-green-50 text-green-700 px-4 py-3 text-sm">
              Mot de passe défini. Redirection…
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              type="password"
              className="input"
              placeholder="Nouveau mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              className="input"
              placeholder="Confirmer le mot de passe"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button className="btn-primary w-full" type="submit">
              Valider
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
