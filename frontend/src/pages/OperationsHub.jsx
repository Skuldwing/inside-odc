import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, Megaphone } from "lucide-react";
import Activities from "./Activities";
import SocialKpis from "./SocialKpis";
import { useAuth } from "../auth/useAuth";

export default function OperationsHub() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("activities");
  const querySearch = searchParams.get("q") || "";

  useEffect(() => {
    if (searchParams.get("action") === "import") {
      setMode("activities");
    }
  }, [searchParams]);

  if (!isAdmin) {
    return <Activities initialSearchQuery={querySearch} />;
  }

  return (
    <div className="space-y-6">
      <section className="surface-glass p-5 lg:p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Opérations
        </p>
        <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
          Flux opérationnels
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pilotage des activités et suivi social.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ModeCard
          active={mode === "activities"}
          title="Activités"
          subtitle="Gestion complète des activités"
          icon={Calendar}
          onClick={() => setMode("activities")}
        />
        <ModeCard
          active={mode === "social"}
          title="KPIs Social"
          subtitle="Saisie mensuelle des réseaux sociaux"
          icon={Megaphone}
          onClick={() => setMode("social")}
        />
      </section>

      {mode === "activities" && <Activities initialSearchQuery={querySearch} />}
      {mode === "social" && <SocialKpis />}
    </div>
  );
}

function ModeCard({ active, title, subtitle, icon: Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`card p-5 text-left transition ${
        active ? "ring-2 ring-orange-400 bg-orange-50" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}
