import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, Megaphone } from "lucide-react";
import Activities from "./Activities";
import SocialKpis from "./SocialKpis";
import { useAuth } from "../auth/useAuth";

const TABS = [
  { key: "activities", label: "Activités", icon: Calendar },
  { key: "social", label: "KPIs Social", icon: Megaphone },
];

/**
 * Cette page empilait un bandeau « Flux opérationnels » et deux grandes cartes
 * de bascule au-dessus de la liste des activités — alors que la barre latérale
 * fait déjà cette navigation. Sur mobile, il fallait traverser 1 180 px avant
 * d'atteindre une seule activité.
 *
 * Les deux cartes deviennent deux onglets, et le bandeau disparaît : environ
 * 400 px récupérés au-dessus de la ligne de flottaison.
 */
export default function OperationsHub() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("activities");
  const querySearch = searchParams.get("q") || "";
  const tabRefs = useRef({});

  useEffect(() => {
    if (searchParams.get("action") === "import") {
      setMode("activities");
    }
  }, [searchParams]);

  if (!isAdmin) {
    return <Activities initialSearchQuery={querySearch} />;
  }

  /* Navigation clavier attendue dans un jeu d'onglets : les fleches deplacent
     la selection, Home/End vont aux extremites. */
  const onKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.key === mode);
    let next = null;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setMode(TABS[next].key);
    tabRefs.current[TABS[next].key]?.focus();
  };

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="Flux opérationnels"
        onKeyDown={onKeyDown}
        className="inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1"
      >
        {TABS.map((tab) => {
          const active = mode === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              ref={(el) => { tabRefs.current[tab.key] = el; }}
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setMode(tab.key)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                active
                  ? "bg-orange-500 text-white shadow-sm shadow-orange-200"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {mode === "activities" && <Activities initialSearchQuery={querySearch} />}
      {mode === "social" && <SocialKpis />}
    </div>
  );
}
