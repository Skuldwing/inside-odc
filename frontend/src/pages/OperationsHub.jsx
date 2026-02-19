import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar,
  Megaphone,
  FileSpreadsheet,
  CheckCircle2,
  Link2,
  ScanSearch,
  Rocket,
} from "lucide-react";
import Activities from "./Activities";
import SocialKpis from "./SocialKpis";
import { useAuth } from "../auth/useAuth";

const importSteps = [
  {
    key: "upload",
    title: "Upload",
    description: "Ajouter le fichier Excel et les informations d activite.",
    icon: FileSpreadsheet,
  },
  {
    key: "validation",
    title: "Validation",
    description: "Verification des champs obligatoires et du format des lignes.",
    icon: ScanSearch,
  },
  {
    key: "mapping",
    title: "Mapping",
    description: "Association automatique participants / activite.",
    icon: Link2,
  },
  {
    key: "resultat",
    title: "Resultat",
    description: "Resume des lignes importees, ignorees et doublons.",
    icon: CheckCircle2,
  },
];

export default function OperationsHub() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("activities");
  const [openImportWizard, setOpenImportWizard] = useState(false);
  const queryAction = searchParams.get("action");
  const querySearch = searchParams.get("q") || "";

  useEffect(() => {
    if (queryAction === "import") {
      setMode("import");
      setOpenImportWizard(true);
    }
  }, [queryAction]);

  if (!isAdmin) {
    return (
      <Activities
        forceUploadOpen={queryAction === "import"}
        initialSearchQuery={querySearch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-glass p-5 lg:p-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
          Operations hub
        </p>
        <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
          Flux operationnels
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Pilotage des activites et suivi social, avec parcours import assiste.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ModeCard
          active={mode === "import"}
          title="Parcours Import"
          subtitle="Workflow guide en 4 etapes"
          icon={Rocket}
          onClick={() => setMode("import")}
        />
        <ModeCard
          active={mode === "activities"}
          title="Activites"
          subtitle="Gestion complete des activites"
          icon={Calendar}
          onClick={() => setMode("activities")}
        />
        <ModeCard
          active={mode === "social"}
          title="KPIs Social"
          subtitle="Saisie mensuelle des reseaux sociaux"
          icon={Megaphone}
          onClick={() => setMode("social")}
        />
      </section>

      {mode === "import" && (
        <section className="card p-5 lg:p-6 space-y-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Parcours d import guide</h2>
            <p className="text-sm text-slate-500">
              Utilise ce workflow pour securiser les imports Excel d activites et de participants.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {importSteps.map((step, idx) => (
              <StepCard key={step.key} step={step} index={idx + 1} />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={() => setOpenImportWizard((prev) => !prev)}
            >
              <Rocket className="w-4 h-4" />
              {openImportWizard ? "Fermer le wizard" : "Demarrer import"}
            </button>
            <button
              className="btn-ghost border border-slate-200 bg-white"
              onClick={() => setMode("activities")}
            >
              Aller a la vue activites
            </button>
          </div>
          {openImportWizard && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3">
              <Activities forceUploadOpen initialSearchQuery={querySearch} />
            </div>
          )}
        </section>
      )}

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

function StepCard({ step, index }) {
  const Icon = step.icon;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">Etape {index}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
          <Icon className="h-4 w-4" />
        </div>
        <p className="font-semibold text-slate-900">{step.title}</p>
      </div>
      <p className="mt-2 text-sm text-slate-500">{step.description}</p>
    </div>
  );
}
