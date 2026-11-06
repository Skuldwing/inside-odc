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
  Award,
  ShieldCheck,
  ShieldAlert,
  KanbanSquare,
  Rocket,
  Wallet,
  Activity,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../auth/useAuth";
import ODCLogo from "../components/branding/ODCLogo";
import { Avatar } from "../components/ui";

/* Navigation, groupee par nature de tache.
   Auparavant : « Pilotage » (4), « Equipe ODC » (1) et « Administration » (8).
   Ce dernier groupe melangeait trois choses sans rapport — les donnees de
   reference, ce qu'on adresse a l'exterieur, et la gouvernance — dans un ordre
   arbitraire : Partenaires, Dispositifs, Campagnes, Utilisateurs, Formulaires,
   Vote, Fiabilite, Audit. Un administrateur y lisait treize entrees d'affilee.

   Les groupes vides pour un role donne ne s'affichent pas : un lecteur ne voit
   que « Pilotage ». */
const GROUPES = [
  {
    titre: "Pilotage",
    items: [
      {
        name: "Tableau de bord",
        icon: LayoutDashboard,
        path: "/dashboard",
        roles: ["admin", "partner", "coach", "viewer"],
        tourId: "nav-dashboard",
      },
      {
        name: "Activités",
        icon: Calendar,
        path: "/activities",
        roles: ["admin", "partner", "coach", "viewer"],
        tourId: "nav-activities",
      },
      {
        name: "Participants",
        icon: Users,
        path: "/participants",
        roles: ["admin", "partner", "coach", "viewer"],
        tourId: "nav-participants",
      },
    ],
  },
  {
    titre: "Équipe ODC",
    equipe: true,
    items: [
      { name: "Mbootay 🐼", icon: KanbanSquare, path: "/mbootay", matchPrefix: true },
      { name: "XATELLE SPACE 🧡", icon: Rocket, path: "/cm-xalette" },
    ],
  },
  {
    /* Ce qui s'adresse aux participants et aux partenaires. */
    titre: "Animation",
    items: [
      { name: "Formulaires", icon: FileText, path: "/formulaires", roles: ["admin"] },
      { name: "Campagnes", icon: MessageSquare, path: "/campagnes", roles: ["admin"] },
      { name: "Vote / Jury", icon: Award, path: "/vote", roles: ["admin"], matchPrefix: true },
    ],
  },
  {
    /* Les donnees de reference, qu'on consulte rarement mais qui structurent
       tout le reste. */
    titre: "Référentiel",
    items: [
      { name: "Partenaires", icon: Building2, path: "/partenaires", roles: ["admin"] },
      { name: "Dispositifs", icon: Layers, path: "/dispositifs", roles: ["admin"] },
      { name: "Attestations", icon: Award, path: "/modeles-attestation", roles: ["admin"] },
    ],
  },
  {
    /* Ce que coutent les seances. Un seul groupe, une seule entree, et elle
       n'apparait que pour un Admin + : les tarifs des partenaires n'ont pas a
       etre lus par tous les administrateurs. Le menu ne protege rien — c'est le
       serveur qui refuse — mais montrer une porte fermee n'a pas d'interet. */
    titre: "Direction",
    adminPlus: true,
    items: [
      { name: "Budget", icon: Wallet, path: "/budget" },
      { name: "Audience", icon: Activity, path: "/audience" },
    ],
  },
  {
    /* Qui a acces, ce qui est fiable, ce qui s'est passe. */
    titre: "Administration",
    items: [
      { name: "Utilisateurs", icon: UserCog, path: "/utilisateurs", roles: ["admin"] },
      { name: "Fiabilité", icon: ShieldAlert, path: "/fiabilite", roles: ["admin"] },
      { name: "Journaux d'audit", icon: ShieldCheck, path: "/audit", roles: ["admin"] },
    ],
  },
];

function NavLink({ item, collapsed, location, onClick, index = 0 }) {
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
      data-tour={item.tourId}
      style={{ animationDelay: `${index * 35}ms` }}
      className={clsx(
        "anim-fade-in-up group",
        collapsed
          ? "sidebar-nav-collapsed flex items-center justify-center rounded-xl py-2.5 transition"
          : "nav-pill",
        active && "nav-pill-active"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110" />
      {!collapsed && item.name}
    </Link>
  );
}

export default function Sidebar({ sidebarOpen, setSidebarOpen, collapsed, onToggle }) {
  const location = useLocation();
  const { role, isTeamOdc, isSuperAdmin, user } = useAuth();
  const safeRole = role || "viewer";

  const roleLabel =
    safeRole === "admin" ? "Admin" :
    safeRole === "partner" ? "Partenaire" :
    safeRole === "coach" ? "Coach / Formateur" : "Lecteur";

  const displayName = user?.full_name || user?.email || roleLabel;
  const profilActif = location.pathname === "/profil";

  return (
    <aside
      className={clsx(
        "odc-sidebar fixed top-0 left-0 z-50 h-full border-r",
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
          "odc-sidebar-header flex min-h-[73px] items-center border-b",
          collapsed ? "flex-col justify-center gap-1 px-2 py-0" : "justify-between px-5 py-0"
        )}>
          <div className={clsx("flex items-center", !collapsed && "gap-3")}>
            <ODCLogo
              variant="mark"
              className={clsx(
                "shadow-lg shadow-orange-500/25 ring-1 ring-orange-300/30",
                collapsed ? "h-8 w-8 rounded-lg" : "h-10 w-10 rounded-xl"
              )}
            />
            {!collapsed && (
              <div>
                <h1 className="odc-sidebar-brand-name font-semibold tracking-tight text-[14px]">
                  Inside ODC
                </h1>
                <p className="odc-sidebar-brand-subtitle text-xs uppercase tracking-[0.2em]">
                  Centre de pilotage
                </p>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle */}
          <button
            className="odc-sidebar-icon-button hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition active:scale-90"
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
              className="odc-sidebar-icon-button lg:hidden transition"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className={clsx("flex-1 overflow-y-auto py-4 space-y-1", collapsed ? "px-2" : "px-4")}>
          {(() => {
            /* Le decalage d'animation continue d'un groupe a l'autre, pour que
               les entrees apparaissent de haut en bas et non par paquets. */
            let rang = 0;

            return GROUPES.map((groupe) => {
              if (groupe.equipe && !isTeamOdc) return null;
              if (groupe.adminPlus && !isSuperAdmin) return null;

              const items = groupe.items.filter(
                (item) => !item.roles || item.roles.includes(safeRole)
              );
              if (!items.length) return null;

              const premier = groupe === GROUPES[0];

              return (
                <div key={groupe.titre} className={premier ? undefined : collapsed ? "pt-2" : "pt-5"}>
                  {!premier && collapsed && <div className="odc-sidebar-divider h-px mx-1 mb-2" />}
                  {!premier && !collapsed && (
                    <div className="px-3"><div className="odc-sidebar-divider h-px" /></div>
                  )}
                  {!collapsed && (
                    <p
                      className={clsx(
                        "odc-sidebar-group-label px-3 mb-2 text-xs uppercase tracking-[0.22em]",
                        premier ? undefined : "mt-4"
                      )}
                    >
                      {groupe.titre}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink
                        key={item.name}
                        item={item}
                        collapsed={collapsed}
                        location={location}
                        onClick={() => setSidebarOpen(false)}
                        index={rang++}
                      />
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </nav>

        {/* Footer — acces au profil.
            Il n'affichait que l'initiale du role : on y lisait « A / Admin /
            Administrateur », jamais le nom de la personne connectee. */}
        <div className={clsx("odc-sidebar-footer border-t", collapsed ? "p-2" : "p-4")}>
          <Link
            to="/profil"
            onClick={() => setSidebarOpen(false)}
            title={collapsed ? `${displayName} — ${roleLabel}` : "Voir mon profil"}
            className={clsx(
              "group flex items-center transition",
              collapsed
                ? "odc-sidebar-profile-collapsed justify-center rounded-xl py-1"
                : "odc-sidebar-profile gap-3 rounded-xl border px-3 py-2.5 transition",
              profilActif && "ring-1 ring-orange-400/60"
            )}
          >
            <Avatar
              userId={user?.id}
              name={user?.full_name}
              email={user?.email}
              updatedAt={user?.avatar_updated_at}
              className="h-9 w-9 rounded-xl"
            />
            {!collapsed && (
              <div className="min-w-0">
                <p className="odc-sidebar-profile-name truncate text-sm font-semibold">{displayName}</p>
                <p className="odc-sidebar-profile-role truncate text-xs">
                  {user?.job_title || roleLabel}
                </p>
              </div>
            )}
          </Link>
        </div>

      </div>
    </aside>
  );
}
