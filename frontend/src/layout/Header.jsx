import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  LogOut,
  Search,
  Bell,
  Sparkles,
  Rocket,
  Users,
  Calendar,
  UserCog,
  FileText,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";

export default function Header({ currentPageName, onMenuClick }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, role } = useAuth();
  const [globalSearch, setGlobalSearch] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);

  const quickActions = useMemo(() => {
    const actions = [
      {
        id: "import",
        label: "Demarrer import",
        icon: Rocket,
        to: "/activities?action=import",
      },
      {
        id: "activities",
        label: "Voir activites",
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
    navigate("/login", { replace: true });
  };

  const handleGlobalSearch = (e) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (!q) return;

    const normalized = q.toLowerCase();
    if (normalized.includes("import")) {
      navigate(`/activities?action=import&q=${encodeURIComponent(q)}`);
      return;
    }
    if (normalized.includes("util")) {
      navigate(`/utilisateurs?q=${encodeURIComponent(q)}`);
      return;
    }
    if (normalized.includes("form")) {
      navigate(`/formulaires?q=${encodeURIComponent(q)}`);
      return;
    }
    if (normalized.includes("activ")) {
      navigate(`/activities?q=${encodeURIComponent(q)}`);
      return;
    }
    navigate(`/participants?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/75 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8 lg:py-4">
        <div className="flex min-w-0 items-center gap-3 lg:gap-4">
          <button
            className="lg:hidden text-slate-600 hover:text-slate-900"
            onClick={onMenuClick}
            aria-label="Ouvrir le menu"
          >
            <Menu />
          </button>

          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
              Inside ODC
            </p>
            <h2 className="truncate text-lg font-semibold text-slate-900 capitalize">
              {currentPageName}
            </h2>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 lg:gap-3">
          <form
            onSubmit={handleGlobalSearch}
            className="hidden xl:flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-[320px]"
          >
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              className="w-full border-none bg-transparent p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              placeholder="Rechercher et appuyer sur Entree..."
              aria-label="Recherche globale"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
            <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              ENTREE
            </span>
          </form>

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
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg z-50">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => navigate(action.to)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <Icon className="h-4 w-4 text-orange-500" />
                      {action.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
          </button>

          <button
            className="btn-ghost border border-red-100 bg-white text-red-600 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" />
            Deconnexion
          </button>
        </div>
      </div>
    </header>
  );
}
