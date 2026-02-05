import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth/useAuth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Erreur de connexion");
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
              Inside ODC
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Connectez-vous pour continuer
            </p>
          </div>

          {error && (
            <div className="mt-6 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <input
              className="input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              className="input"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button className="btn-primary w-full">Se connecter</button>
          </form>
        </div>
      </div>
    </div>
  );
}
