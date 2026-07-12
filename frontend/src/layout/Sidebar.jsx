import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Building2,
  Layers,
  UserCog,
  MessageSquare,
  FileText,
  BarChart3,
  Bot,
  Award,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../auth/useAuth";
import ODCLogo from "../components/branding/ODCLogo";

const navigation = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
    roles: ["admin", "partner", "viewer"],
  },
  {
    name: "Dashboard Social",
    icon: BarChart3,
    path: "/social-dashboard",
    roles: ["admin"],
  },
  {
    name: "Assistant IA",
    icon: Bot,
    path: "/assistant-ia",
    roles: ["admin"],
  },
  {
    name: "Activites",
    icon: Calendar,
    path: "/activities",
    roles: ["admin", "partner", "viewer"],
  },
  {
    name: "Participants",
    icon: Users,
    path: "/participants",
    roles: ["admin", "partner", "viewer"],
  },
];

const managementNavigation = [
  {
    name: "Partenaires",
    icon: Building2,
    path: "/partenaires",
    roles: ["admin"],
  },
  {
    name: "Dispositifs",
    icon: Layers,
    path: "/dispositifs",
    roles: ["admin"],
  },
  {
    name: "Campagnes",
    icon: MessageSquare,
    path: "/campagnes",
    roles: ["admin"],
  },
  {
    name: "Utilisateurs",
    icon: UserCog,
    path: "/utilisateurs",
    roles: ["admin"],
  },
  {
    name: "Formulaires",
    icon: FileText,
    path: "/formulaires",
    roles: ["admin"],
  },
  {
    name: "Vote / Jury",
    icon: Award,
    path: "/vote",
    roles: ["admin"],
    matchPrefix: true,
  },
];

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  currentPageName: _currentPageName,
}) {
  const location = useLocation();
  const { role } = useAuth();
  const safeRole = role || "viewer";

  return (
    <aside
      className={clsx(
        "fixed top-0 left-0 z-50 h-full w-72 border-r border-white/10 text-white/90",
        "bg-[radial-gradient(circle_at_10%_-10%,#1e293b_0%,#0b1220_48%,#050915_100%)]",
        "shadow-2xl shadow-slate-950/50",
        "transform transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0"
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <ODCLogo variant="mark" className="h-11 w-11 rounded-2xl shadow-lg shadow-orange-500/30 ring-1 ring-orange-300/30" />
            <div>
              <h1 className="text-white font-semibold tracking-tight text-[15px]">
                Inside ODC
              </h1>
              <p className="text-[11px] text-slate-400 uppercase tracking-[0.2em]">
                Command Center
              </p>
            </div>
          </div>

          <button
            className="lg:hidden text-slate-400 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fermer le menu"
          >
            <X />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-1">
          <p className="px-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Pilotage
          </p>
          <div className="mt-2 space-y-1">
            {navigation
              .filter((item) => item.roles.includes(safeRole))
              .map((item) => {
                const active = item.matchPrefix
                  ? location.pathname.startsWith(item.path)
                  : (item.path === "/" && location.pathname === "/") ||
                    (item.path !== "/" && location.pathname === item.path);

                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={clsx(
                      "nav-pill",
                      active && "nav-pill-active"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                );
              })}
          </div>

          {managementNavigation.some((item) => item.roles.includes(safeRole)) && (
            <div className="pt-5">
              <div className="px-3">
                <div className="h-px bg-white/10" />
              </div>
              <p className="px-3 mt-4 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Administration
              </p>
              <div className="mt-2 space-y-1">
                {managementNavigation
                  .filter((item) => item.roles.includes(safeRole))
                  .map((item) => {
                    const active =
                      (item.path === "/" && location.pathname === "/") ||
                      (item.path !== "/" && location.pathname === item.path);

                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => setSidebarOpen(false)}
                        className={clsx(
                          "nav-pill",
                          active && "nav-pill-active"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {item.name}
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-white/10 bg-black/20">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center font-semibold">
              {safeRole.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white text-sm font-medium">
                {safeRole === "admin"
                  ? "Admin"
                  : safeRole === "partner"
                  ? "Partenaire"
                  : "Lecteur"}
              </p>
              <p className="text-xs text-slate-400">
                {safeRole === "admin"
                  ? "Administrateur"
                  : safeRole === "partner"
                  ? "Compte partenaire"
                  : "Lecture seule"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
