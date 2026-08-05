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
  ShieldCheck,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../auth/useAuth";
import ODCLogo from "../components/branding/ODCLogo";

const navigation = [
  {
    name: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
    roles: ["admin", "partner", "coach", "viewer"],
  },
  {
    name: "Radar Social",
    icon: BarChart3,
    path: "/social-dashboard",
    roles: ["admin"],
  },
  {
    name: "Pobarr",
    icon: Bot,
    path: "/assistant-ia",
    roles: ["admin"],
  },
  {
    name: "Activités",
    icon: Calendar,
    path: "/activities",
    roles: ["admin", "partner", "coach", "viewer"],
  },
  {
    name: "Participants",
    icon: Users,
    path: "/participants",
    roles: ["admin", "partner", "coach", "viewer"],
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
  {
    name: "Journaux d'audit",
    icon: ShieldCheck,
    path: "/audit",
    roles: ["admin"],
  },
];

function NavLink({ item, collapsed, location, onClick }) {
  const active = item.matchPrefix
    ? location.pathname.startsWith(item.path)
    : (item.path === "/" && location.pathname === "/") ||
      (item.path !== "/" && location.pathname === item.path);

  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      onClick={onClick}
      title={collapsed ? item.name : undefined}
      className={clsx(
        collapsed
          ? "flex items-center justify-center rounded-xl py-2.5 text-slate-300 hover:bg-white/10 hover:text-white transition"
          : "nav-pill",
        active && "nav-pill-active"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && item.name}
    </Link>
  );
}

export default function Sidebar({ sidebarOpen, setSidebarOpen, collapsed, onToggle }) {
  const location = useLocation();
  const { role } = useAuth();
  const safeRole = role || "viewer";

  const roleLabel =
    safeRole === "admin" ? "Admin" :
    safeRole === "partner" ? "Partenaire" :
    safeRole === "coach" ? "Coach / Formateur" : "Lecteur";

  const roleDesc =
    safeRole === "admin" ? "Administrateur" :
    safeRole === "partner" ? "Compte partenaire" :
    safeRole === "coach" ? "Compte formateur" : "Lecture seule";

  return (
    <aside
      className={clsx(
        "fixed top-0 left-0 z-50 h-full border-r border-white/10 text-white/90",
        "bg-[radial-gradient(circle_at_10%_-10%,#1e293b_0%,#0b1220_48%,#050915_100%)]",
        "shadow-2xl shadow-slate-950/50",
        "transform transition-all duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0",
        "w-64",
        collapsed && "lg:w-16"
      )}
    >
      <div className="flex h-full flex-col">

        {/* Header */}
        <div className={clsx(
          "flex items-center border-b border-white/10",
          collapsed ? "flex-col gap-2 px-2 py-4" : "justify-between px-5 py-4"
        )}>
          <div className={clsx("flex items-center", !collapsed && "gap-3")}>
            <ODCLogo
              variant="mark"
              className={clsx(
                "shadow-lg shadow-orange-500/30 ring-1 ring-orange-300/30",
                collapsed ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
              )}
            />
            {!collapsed && (
              <div>
                <h1 className="text-white font-semibold tracking-tight text-[14px]">
                  Inside ODC
                </h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em]">
                  Centre de pilotage
                </p>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle */}
          <button
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            onClick={onToggle}
            title={collapsed ? "Développer" : "Réduire"}
          >
            {collapsed
              ? <ChevronRight className="w-3.5 h-3.5" />
              : <ChevronLeft className="w-3.5 h-3.5" />
            }
          </button>

          {/* Mobile close */}
          {!collapsed && (
            <button
              className="lg:hidden text-slate-400 hover:text-white transition"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className={clsx("flex-1 overflow-y-auto py-4 space-y-1", collapsed ? "px-2" : "px-4")}>
          {!collapsed && (
            <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Pilotage
            </p>
          )}
          <div className="space-y-0.5">
            {navigation
              .filter((item) => item.roles.includes(safeRole))
              .map((item) => (
                <NavLink
                  key={item.name}
                  item={item}
                  collapsed={collapsed}
                  location={location}
                  onClick={() => setSidebarOpen(false)}
                />
              ))}
          </div>

          {managementNavigation.some((item) => item.roles.includes(safeRole)) && (
            <div className={collapsed ? "pt-2" : "pt-5"}>
              {collapsed ? (
                <div className="h-px bg-white/10 mx-1 mb-2" />
              ) : (
                <>
                  <div className="px-3"><div className="h-px bg-white/10" /></div>
                  <p className="px-3 mt-4 mb-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    Administration
                  </p>
                </>
              )}
              <div className="space-y-0.5">
                {managementNavigation
                  .filter((item) => item.roles.includes(safeRole))
                  .map((item) => (
                    <NavLink
                      key={item.name}
                      item={item}
                      collapsed={collapsed}
                      location={location}
                      onClick={() => setSidebarOpen(false)}
                    />
                  ))}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className={clsx("border-t border-white/10 bg-black/20", collapsed ? "p-2" : "p-4")}>
          {collapsed ? (
            <div className="flex justify-center">
              <div
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center font-semibold text-sm"
                title={roleLabel}
              >
                {safeRole.charAt(0).toUpperCase()}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center font-semibold text-sm">
                {safeRole.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-white text-sm font-medium">{roleLabel}</p>
                <p className="text-xs text-slate-400">{roleDesc}</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </aside>
  );
}
