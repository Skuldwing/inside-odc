import { useCallback, useEffect, useState } from "react";
import { Rows3, Rows4 } from "lucide-react";

const STORAGE_KEY = "list_density";

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "compacte" ? "compacte" : "confortable";
  } catch {
    /* navigation privee, stockage bloque : on retombe sur le defaut. */
    return "confortable";
  }
}

/* Un seul reglage pour toute la plateforme : le changer sur une page le change
   partout. Les listes s'abonnent via l'evenement, pour rester en phase meme si
   deux composants montes affichent le reglage en meme temps. */
const EVENT = "inside-odc:density";

export function useDensity() {
  const [density, setDensityState] = useState(read);

  useEffect(() => {
    const sync = () => setDensityState(read());
    window.addEventListener(EVENT, sync);
    /* `storage` couvre le cas des deux onglets ouverts cote a cote. */
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setDensity = useCallback((value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* Le reglage ne survivra pas au rechargement, mais l'affichage suit. */
    }
    setDensityState(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return {
    density,
    setDensity,
    isCompact: density === "compacte",
    /* A appliquer sur le conteneur d'une liste de cartes. */
    listGap: density === "compacte" ? "gap-2" : "gap-4",
    /* A appliquer sur une carte de liste. */
    cardPadding: density === "compacte" ? "p-3" : "p-5",
    /* A appliquer sur une cellule de tableau. */
    cellPadding: density === "compacte" ? "px-3 py-1.5" : "px-4 py-3",
  };
}

export default function DensityToggle({ className = "" }) {
  const { density, setDensity } = useDensity();

  const OPTIONS = [
    { key: "confortable", label: "Confortable", icon: Rows3 },
    { key: "compacte", label: "Compacte", icon: Rows4 },
  ];

  return (
    <div
      role="group"
      aria-label="Densité d'affichage"
      className={`inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = density === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setDensity(opt.key)}
            aria-pressed={active}
            title={`Affichage ${opt.label.toLowerCase()}`}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
              active ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
