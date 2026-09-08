import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import OnboardingTour from "../components/OnboardingTour";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    ["/participants", "Participants"],
    ["/partenaires", "Partenaires"],
    ["/dispositifs", "Dispositifs"],
    ["/campagnes", "Campagnes"],
    ["/utilisateurs", "Utilisateurs"],
    ["/formulaires", "Formulaires"],
    ["/vote", "Vote / Jury"],
    ["/fiabilite", "Fiabilité"],
    ["/audit", "Journaux d'audit"],
    ["/social-dashboard", "Radar Social"],
    ["/assistant-ia", "Pobarr"],
    ["/rapport-mensuel", "Rapport mensuel"],
  ];

  const currentPageName =
    location.pathname === "/"
      ? "Tableau de bord"
      : PAGE_TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ||
        location.pathname.replace("/", "");

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  return (
    <div className="min-h-screen">
      <OnboardingTour />
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
