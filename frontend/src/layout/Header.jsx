import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  LogOut,
  Search,
  Sparkles,
  Users,
  Calendar,
  UserCog,
  FileText,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import ODCLogo from "../components/branding/ODCLogo";
import NotificationBell from "../components/NotificationBell";
import { ThemeToggle } from "../components/ui";

export default function Header({ currentPageName, onMenuClick, onOpenSearch }) {
  /* macOS affiche ⌘K, le reste Ctrl K. */
  const shortcutLabel =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "")
      ? "⌘K"
      : "Ctrl K";
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, role } = useAuth();
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);

  const quickActions = useMemo(() => {
    const actions = [
      {
        id: "activities",
        label: "Voir les activités",
        icon: Calendar,
        to: "/activities",
      },
      {
        id: "participants",
        label: "Voir participants",
        icon: Users,
        to: "/participants",
      },
    ];

    if (role === "admin") {
      actions.push({
        id: "new-form",
        label: "Nouveau formulaire",
        icon: FileText,
        to: "/formulaires?action=new",
      });
      actions.push({
        id: "users",
        label: "Voir utilisateurs",
        icon: UserCog,
        to: "/utilisateurs",
      });
    }

    return actions;
  }, [role]);

  useEffect(() => {
    if (!actionsOpen) return;
    const onClickOutside = (event) => {
      if (!actionsRef.current?.contains(event.target)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [actionsOpen]);

  useEffect(() => {
    setActionsOpen(false);
  }, [location.pathname, location.search]);

  const handleLogout = async () => {
    await logout();
    /* Apres deconnexion on revient a l'accueil public du domaine : c'est la
       page d'ou l'on repart, et elle porte deja le bouton de connexion. */
    navigate("/", { replace: true });
  };


  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8 lg:py-4">
        <div className="flex min-w-0 items-center gap-3 lg:gap-4">
          <button
            className="lg:hidden text-slate-600 transition-transform hover:text-slate-900 active:scale-90"
            onClick={onMenuClick}
            aria-label="Ouvrir le menu"
          >
            <Menu />
          </button>

          <div className="min-w-0 flex items-center gap-3">
            <ODCLogo variant="mark" className="hidden h-8 w-8 rounded-lg sm:block" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                Inside ODC
              </p>
              {/* Plus de `capitalize` : les libelles sont deja correctement
                  casses, et la regle transformait "Journaux d'audit" en
                  "Journaux D'audit". */}
              <h2 className="truncate text-lg font-semibold text-slate-900">
                {currentPageName}
              </h2>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 lg:gap-3">
          {/* L'ancien champ n'interrogeait aucune donnee : il testait quatre
              chaines en dur et renvoyait tout le reste sur Participants. Il
              ouvre desormais la vraie recherche. */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-orange-300 xl:flex xl:min-w-[240px] 2xl:min-w-[320px]"
          >
            <Search className="h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
            <span className="flex-1 text-sm text-slate-500">Rechercher…</span>
            <kbd className="flex-shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-500">
              {shortcutLabel}
            </kbd>
          </button>

          {/* Sous xl, le champ n'a pas la place : une icone suffit. */}
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Rechercher"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-orange-300 xl:hidden"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="relative hidden sm:block" ref={actionsRef}>
            {role === "admin" && (
              <button
                className="inline-flex btn-primary mr-2"
                onClick={() => navigate("/formulaires?action=new")}
              >
                <FileText className="w-4 h-4" />
                Formulaire
              </button>
            )}
            <button
              className="inline-flex btn-ghost border border-slate-200 bg-white text-slate-600"
              onClick={() => setActionsOpen((prev) => !prev)}
            >
              <Sparkles className="w-4 h-4 text-orange-500" />
              Actions
            </button>
            {actionsOpen && (
              <div className="anim-dropdown absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50">
                {quickActions.map((action, index) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => navigate(action.to)}
                      style={{ animationDelay: `${index * 30}ms` }}
                      className="anim-fade-in-up flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-orange-50"
                    >
                      <Icon className="h-4 w-4 text-orange-500" />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <ThemeToggle className="hidden sm:inline-flex" />

          <NotificationBell />

          <button
            className="btn-ghost border border-red-100 bg-white text-red-600 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
