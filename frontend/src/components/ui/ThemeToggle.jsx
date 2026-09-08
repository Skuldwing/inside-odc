import { useCallback, useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

const KEY = "theme";
const EVENT = "inside-odc:theme";

function readPreference() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "dark" || saved === "light" ? saved : "system";
  } catch {
    return "system";
  }
}

function systemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/* Le drapeau est pose sur <html> par un script inline dans index.html, avant
   le premier rendu : sans lui, un utilisateur en mode sombre verrait un eclair
   blanc a chaque chargement. Ici on ne fait que le maintenir a jour. */
function apply(preference) {
  const dark = preference === "dark" || (preference === "system" && systemPrefersDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function useTheme() {
  const [preference, setPreferenceState] = useState(readPreference);

  useEffect(() => {
    const sync = () => setPreferenceState(readPreference());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /* En mode « systeme », on suit les changements de reglage de l'appareil
     sans que l'utilisateur ait a recharger. */
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((value) => {
    try {
      if (value === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, value);
    } catch {
      /* stockage bloque : le choix ne survivra pas au rechargement */
    }
    apply(value);
    setPreferenceState(value);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { preference, setPreference };
}

const OPTIONS = [
  { key: "light", label: "Clair", icon: Sun },
  { key: "dark", label: "Sombre", icon: Moon },
  { key: "system", label: "Système", icon: Monitor },
];

export default function ThemeToggle({ className = "" }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Thème de l'interface"
      className={`inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white ${className}`}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = preference === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setPreference(opt.key)}
            aria-pressed={active}
            title={`Thème ${opt.label.toLowerCase()}`}
            className={`inline-flex h-9 w-9 items-center justify-center transition-colors ${
              active ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
