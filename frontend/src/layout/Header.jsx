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
import NotificationBell from "../components/NotificationBell";
import { ThemeToggle } from "../components/ui";

export default function Header({ onMenuClick, onOpenSearch }) {
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
  const headerRef = useRef(null);

  /* La hauteur reelle de l'en-tete est publiee en variable CSS : les barres
     collantes des pages s'y accrochent sans dependre de valeurs en dur, qui
     varient selon la taille de l'ecran et le mode tactile. */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--app-header-h",
        `${el.offsetHeight}px`
      );
    publish();
    window.addEventListener("resize", publish);
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      window.removeEventListener("resize", publish);
      observer.disconnect();
    };
  }, []);

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
      {
        id: "my-tasks",
        label: "Voir mes tâches",
        icon: FileText,
        to: "/mbootay?section=taches",
      },
      {
        id: "weekly-follow-up",
        label: "Suivi de la semaine",
        icon: Calendar,
        to: "/mbootay?section=suivi",
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
    <header
      ref={headerRef}
      className="app-topbar sticky top-0 z-30 border-b backdrop-blur-xl"
    >
      <div className="flex min-h-[64px] items-center justify-start gap-1 px-3 sm:gap-3 sm:px-4 lg:gap-5 lg:px-8">
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <button
            className="lg:hidden text-slate-600 transition-transform hover:text-slate-900 active:scale-90"
            onClick={onMenuClick}
            aria-label="Ouvrir le menu"
          >
            <Menu />
          </button>

          <img src="/logo-odc-sonatel.png" alt="Orange Digital Center Sonatel" className="h-7 w-[112px] object-cover object-center sm:h-8 sm:w-[132px]" />
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-start gap-1 sm:gap-2 lg:gap-3">
          {/* L'ancien champ n'interrogeait aucune donnee : il testait quatre
              chaines en dur et renvoyait tout le reste sur Participants. Il
              ouvre desormais la vraie recherche. */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-left transition hover:border-orange-300 sm:gap-2 sm:px-3 xl:min-w-[220px] xl:max-w-[440px]"
          >
            <Search className="h-4 w-4 flex-shrink-0 text-slate-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500 sm:text-sm">Rechercher…</span>
            <kbd className="hidden flex-shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-500 xl:block">
              {shortcutLabel}
            </kbd>
          </button>

          <div className="relative" ref={actionsRef}>
            <button
              className="inline-flex btn-ghost border border-slate-200 bg-white px-2 text-slate-600 sm:px-3"
              onClick={() => setActionsOpen((prev) => !prev)}
            >
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="hidden sm:inline">Actions</span>
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
            title="Déconnexion"
            aria-label="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>
    </header>
  );
}
