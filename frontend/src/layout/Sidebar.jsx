import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  Users,
  Building2,
  Layers,
  UserCog,
  MessageSquare,
  BarChart3,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../auth/useAuth";

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
];

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  currentPageName,
}) {
  const location = useLocation();
  const { role } = useAuth();
  const safeRole = role || "viewer";

  return (
    <aside
      className={clsx(
        "fixed top-0 left-0 z-50 h-full w-64 bg-slate-950 text-white/90",
        "shadow-2xl shadow-slate-900/40",
        "transform transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0"
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-500 flex items-center justify-center text-white font-bold shadow-lg shadow-orange-500/30">
              O
            </div>
            <div>
              <h1 className="text-white font-semibold tracking-tight">
                Inside ODC
              </h1>
              <p className="text-xs text-slate-400">Orange Digital Center</p>
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

        <nav className="flex-1 p-4 space-y-1">
          <p className="px-4 text-[11px] uppercase tracking-widest text-slate-500">
            Pilotage
          </p>
          <div className="mt-2 space-y-1">
            {navigation
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
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition",
                      active
                        ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                );
              })}
          </div>

          {managementNavigation.some((item) => item.roles.includes(safeRole)) && (
            <div className="pt-5">
              <div className="px-4">
                <div className="h-px bg-white/10" />
              </div>
              <p className="px-4 mt-4 text-[11px] uppercase tracking-widest text-slate-500">
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
                          "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition",
                          active
                            ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                            : "text-slate-300 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <Icon className="w-5 h-5" />
                        {item.name}
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center font-semibold">
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
