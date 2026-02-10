import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function AdminPinGate({ children }) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);
  const PIN_TTL_MS = 20 * 60 * 1000;

  const verifyPin = async (value) => {
    setSubmitting(true);
    setError("");
    try {
      sessionStorage.setItem("admin_pin", value);
      sessionStorage.setItem("admin_pin_time", String(Date.now()));
      await api.post("/auth/verify-pin");
      setVerified(true);
    } catch {
      sessionStorage.removeItem("admin_pin");
      setError("PIN incorrect.");
      setVerified(false);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    let existing = sessionStorage.getItem("admin_pin");
    const ts = Number(sessionStorage.getItem("admin_pin_time") || 0);
    if (existing && ts && Date.now() - ts > PIN_TTL_MS) {
      sessionStorage.removeItem("admin_pin");
      sessionStorage.removeItem("admin_pin_time");
      existing = null;
    }
    if (!existing) {
      setChecking(false);
      return;
    }
    verifyPin(existing).finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500">
        Vérification du PIN…
      </div>
    );
  }

  if (verified) return children;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="card-solid w-full max-w-sm p-6">
        <h2 className="text-xl font-semibold mb-2">Code PIN requis</h2>
        <p className="text-sm text-slate-500 mb-4">
          Entrez le PIN admin pour accéder à cette page.
        </p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!pin) return;
            verifyPin(pin);
          }}
          className="space-y-4"
        >
          <input
            type="password"
            className="input"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoFocus
          />
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              className="btn-ghost border"
              onClick={() => navigate("/")}
              disabled={submitting}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={submitting || !pin}
            >
              {submitting ? "Vérification…" : "Valider"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
