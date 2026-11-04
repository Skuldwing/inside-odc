import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import OnboardingTour from "../components/OnboardingTour";
import CommandPalette from "../components/ui/CommandPalette";
import { useAuth } from "../auth/useAuth";
import { appliquerMeta, PAGES } from "../seo/meta";
import { IDENTITE } from "../config/identite";

export default function Layout() {
  const { isAdmin, isTeamOdc } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar_collapsed") === "true"
  );
  const location = useLocation();

  /* Le titre de l'en-tete etait derive du chemin d'URL : une application en
     francais affichait donc "Activities" et "Dashboard". Les libelles sont
     desormais explicites, et les sous-routes retombent sur leur section. */
  const PAGE_TITLES = [
    ["/mbootay", "Mbootay"],
    ["/activities", "Activités"],
    ["/dashboard", "Tableau de bord"],
    ["/participants", "Participants"],
    ["/profil", "Profil"],
    ["/partenaires", "Partenaires"],
    ["/dispositifs", "Dispositifs"],
    ["/modeles-attestation", "Modèles d'attestation"],
    ["/campagnes", "Campagnes"],
    ["/utilisateurs", "Utilisateurs"],
    ["/formulaires", "Formulaires"],
    ["/vote", "Vote / Jury"],
    ["/fiabilite", "Fiabilité"],
    ["/audit", "Journaux d'audit"],
    ["/rapport-mensuel", "Rapport mensuel"],
    ["/budget", "Budget"],
    ["/audience", "Audience du site"],
  ];

  const currentPageName =
    PAGE_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ||
    location.pathname.replace("/", "");

  /* Deux choses d'un coup, pour tout l'espace de travail.

     L'onglet porte enfin le nom de l'écran ouvert. Toutes les pages du site
     s'annonçaient « Inside ODC » : avec six onglets ouverts — et c'est le
     quotidien ici — aucun n'était reconnaissable, et un favori ne disait rien
     de ce qu'il rouvrait.

     Et « noindex » : rien de ce qui vit derrière une connexion n'a sa place
     dans un moteur de recherche. robots.txt le dit déjà, mais un robot qui
     arrive par un lien n'est pas tenu de l'avoir lu, alors que la balise
     voyage avec la page. */
  useEffect(() => {
    appliquerMeta({
      ...PAGES.prive,
      titre: currentPageName
        ? `${currentPageName} — ${IDENTITE.nomCourt}`
        : PAGES.prive.titre,
    });
  }, [currentPageName]);

  /* Ctrl/Cmd + K depuis n'importe ou, sauf quand on est deja en train de
     saisir du texte ailleurs. La touche « / » ouvre aussi la recherche, comme
     dans la plupart des outils de ce type. */
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = e.target?.tagName;
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  return (
    <div className="min-h-screen">
      <OnboardingTour />

      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        isAdmin={isAdmin}
        isTeamOdc={isTeamOdc}
      />
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
      />

      <div
        className={collapsed ? "lg:pl-16" : "lg:pl-64"}
        style={{ transition: "padding-left 0.3s" }}
      >
        <Header
          currentPageName={currentPageName}
          onMenuClick={() => setSidebarOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main className="p-4 lg:p-6">
          <div key={location.pathname} className="anim-page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
