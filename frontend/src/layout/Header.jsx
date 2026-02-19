import { useNavigate } from "react-router-dom";
import { Menu, LogOut, Search, Bell, Sparkles } from "lucide-react";
import { useAuth } from "../auth/useAuth";

export default function Header({ currentPageName, onMenuClick }) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
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
          <div className="hidden xl:flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-[280px]">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              className="w-full border-none bg-transparent p-0 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              placeholder="Rechercher un partenaire, activite, participant..."
              aria-label="Recherche globale"
            />
            <span className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
              CTRL K
            </span>
          </div>

          <button className="hidden sm:inline-flex btn-ghost border border-slate-200 bg-white text-slate-600">
            <Sparkles className="w-4 h-4 text-orange-500" />
            Actions
          </button>

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
