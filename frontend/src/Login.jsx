import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth/useAuth";
import ODCLogo from "./components/branding/ODCLogo";

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
    <div className="relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-login-bg absolute inset-0 opacity-80" />
        <div className="animate-float-slow absolute -left-20 -top-16 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="animate-float-slow-delayed absolute -right-16 top-1/4 h-80 w-80 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="animate-float-slow absolute bottom-[-8rem] left-1/3 h-72 w-72 rounded-full bg-orange-300/30 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="w-full max-w-md">
          <div className="animate-fade-up-delay-1 card p-8">
            <div className="text-center">
              <ODCLogo className="mx-auto mb-5 w-full max-w-[340px] animate-fade-up-delay-2" />
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

              <button className="btn-primary w-full animate-glow-soft">Se connecter</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
