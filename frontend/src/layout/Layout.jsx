import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar_collapsed") === "true"
  );
  const location = useLocation();

  const currentPageName = location.pathname.replace("/", "") || "Dashboard";

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  return (
    <div className="min-h-screen">
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
