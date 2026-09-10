import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Calendar,
  Users,
  Building2,
  Layers,
  FileText,
  UserCog,
  KanbanSquare,
  CornerDownLeft,
  Loader2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../../api";

const ICONS = {
  activite: Calendar,
  participant: Users,
  partenaire: Building2,
  dispositif: Layers,
  formulaire: FileText,
  utilisateur: UserCog,
  projet: KanbanSquare,
  page: Search,
};

/* Raccourcis de navigation : la palette sert aussi a aller quelque part,
   pas seulement a retrouver une fiche. Filtres par role a l'affichage. */
const PAGES = [
  { label: "Tableau de bord", url: "/dashboard", keywords: "dashboard accueil kpi" },
  { label: "Activités", url: "/activities", keywords: "activites formations sessions" },
  { label: "Participants", url: "/participants", keywords: "beneficiaires apprenants" },
  { label: "Partenaires", url: "/partenaires", admin: true, keywords: "crm structures" },
  { label: "Dispositifs", url: "/dispositifs", admin: true, keywords: "programmes" },
  { label: "Campagnes", url: "/campagnes", admin: true, keywords: "emailing mail" },
  { label: "Utilisateurs", url: "/utilisateurs", admin: true, keywords: "comptes acces roles" },
  { label: "Formulaires", url: "/formulaires", admin: true, keywords: "questionnaires" },
  { label: "Fiabilité", url: "/fiabilite", admin: true, keywords: "verification qualite donnees" },
  { label: "Journaux d'audit", url: "/audit", admin: true, keywords: "logs historique" },
  { label: "Mbootay", url: "/mbootay", team: true, keywords: "projets internes equipe" },
];

/* Les dates arrivent en ISO : on les affiche en francais plutot qu'au
   format par defaut du moteur JavaScript. */
function formatMeta(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    return format(parseISO(value), "d MMM yyyy", { locale: fr });
  } catch {
    return value;
  }
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function CommandPalette({ open, onClose, isAdmin, isTeamOdc }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const previouslyFocused = useRef(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  /* Pages correspondant a la saisie, insensibles aux accents : « fiabilite »
     doit trouver « Fiabilité ». */
  const pageMatches = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return PAGES.filter((p) => {
      if (p.admin && !isAdmin) return false;
      if (p.team && !isTeamOdc) return false;
      return normalize(p.label).includes(q) || normalize(p.keywords).includes(q);
    }).slice(0, 4);
  }, [query, isAdmin, isTeamOdc]);

  /* Liste aplatie : c'est elle qui porte la navigation au clavier. */
  const flat = useMemo(() => {
    const out = pageMatches.map((p) => ({
      type: "page",
      groupLabel: "Aller à",
      title: p.label,
      subtitle: null,
      meta: null,
      url: p.url,
    }));
    for (const g of results) {
      for (const item of g.items) {
        out.push({ ...item, type: g.type, groupLabel: g.label });
      }
    }
    return out;
  }, [pageMatches, results]);

  /* Regroupement pour l'affichage, dans l'ordre de la liste aplatie. */
  const grouped = useMemo(() => {
    const out = [];
    flat.forEach((item, index) => {
      const last = out[out.length - 1];
      if (last && last.label === item.groupLabel) last.items.push({ ...item, index });
      else out.push({ label: item.groupLabel, items: [{ ...item, index }] });
    });
    return out;
  }, [flat]);

  /* Recherche serveur, differee : on ne part pas a chaque frappe. */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api
        .get("/search", { params: { q }, signal: controller.signal })
        .then((res) => {
          setResults(Array.isArray(res.data?.groups) ? res.data.groups : []);
          setFailed(false);
        })
        .catch((err) => {
          /* Une requete annulee par une frappe suivante n'est pas une erreur. */
          if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
          console.error("Erreur recherche", err);
          setResults([]);
          setFailed(true);
        })
        .finally(() => setLoading(false));
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  useEffect(() => setActive(0), [query]);

  /* Ouverture : focus dans le champ, restitution a la fermeture. */
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = previousOverflow;
      const el = previouslyFocused.current;
      if (el && typeof el.focus === "function" && document.contains(el)) el.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setFailed(false);
    }
  }, [open]);

  const go = useCallback(
    (item) => {
      if (!item) return;
      onClose();
      navigate(item.url);
    },
    [navigate, onClose]
  );

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active]);
    }
  };

  /* Garde l'element selectionne visible quand on descend au clavier. */
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const tooShort = query.trim().length > 0 && query.trim().length < 2;
  const noResults = !loading && !failed && query.trim().length >= 2 && flat.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/50 px-4 pt-[10vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche"
        className="anim-modal-panel card-solid flex w-full max-w-2xl flex-col overflow-hidden"
        style={{ maxHeight: "70vh" }}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
          {loading ? (
            <Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-orange-500" aria-hidden="true" />
          ) : (
            <Search className="h-5 w-5 flex-shrink-0 text-slate-500" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Rechercher une activité, un participant, un partenaire…"
            aria-label="Rechercher"
            aria-expanded={flat.length > 0}
            aria-controls="palette-resultats"
            className="w-full border-none bg-transparent p-0 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="hidden flex-shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 sm:block">
            Échap
          </kbd>
        </div>

        <div id="palette-resultats" ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
          {query.trim().length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              Tapez pour chercher parmi les activités, les participants,
              les partenaires et les pages de la plateforme.
            </p>
          )}

          {tooShort && (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              Encore un caractère…
            </p>
          )}

          {failed && (
            <p className="px-3 py-8 text-center text-sm text-red-600">
              La recherche n'a pas abouti. Réessayez dans un instant.
            </p>
          )}

          {noResults && (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                Aucun résultat pour « {query.trim()} »
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Vérifiez l'orthographe, ou essayez un terme plus court.
              </p>
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.label}
              </p>
              {group.items.map((item) => {
                const Icon = ICONS[item.type] || Search;
                const selected = item.index === active;
                return (
                  <button
                    key={`${item.type}-${item.id ?? item.url}-${item.index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-index={item.index}
                    onMouseEnter={() => setActive(item.index)}
                    onClick={() => go(item)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      selected ? "bg-orange-50 text-orange-900" : "hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        selected ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">
                        {item.title}
                      </span>
                      {item.subtitle && (
                        <span className="block truncate text-xs text-slate-500">
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                    {item.meta && (
                      <span className="hidden flex-shrink-0 text-xs text-slate-500 sm:block">
                        {formatMeta(item.meta)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="hidden flex-shrink-0 items-center gap-4 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 sm:flex">
          <span className="flex items-center gap-1">
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            naviguer
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
            ouvrir
          </span>
          <span className="ml-auto">
            {flat.length > 0 && `${flat.length} résultat${flat.length > 1 ? "s" : ""}`}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
