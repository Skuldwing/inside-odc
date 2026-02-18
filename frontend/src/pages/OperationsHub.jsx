import { useState } from "react";
import { Calendar, Megaphone } from "lucide-react";
import Activities from "./Activities";
import SocialKpis from "./SocialKpis";
import { useAuth } from "../auth/useAuth";

export default function OperationsHub() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [mode, setMode] = useState("activities");

  if (!isAdmin) {
    return <Activities />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setMode("activities")}
          className={`card p-5 text-left transition ${
            mode === "activities"
              ? "ring-2 ring-orange-400 bg-orange-50"
              : "hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">Activites</p>
              <p className="text-sm text-slate-500">
                Import Excel et gestion des activites
              </p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setMode("social")}
          className={`card p-5 text-left transition ${
            mode === "social"
              ? "ring-2 ring-orange-400 bg-orange-50"
              : "hover:bg-slate-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-slate-900">KPIs Social</p>
              <p className="text-sm text-slate-500">
                Saisie mensuelle des reseaux sociaux
              </p>
            </div>
          </div>
        </button>
      </div>

      {mode === "activities" ? <Activities /> : <SocialKpis />}
    </div>
  );
}
