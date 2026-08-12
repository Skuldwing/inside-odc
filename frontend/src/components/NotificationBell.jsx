import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, CalendarPlus, Pencil, Trash2, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { useAuth } from "../auth/useAuth";

const ACTION_CFG = {
  CREATE: { Icon: CalendarPlus, color: "text-emerald-600 bg-emerald-50" },
  UPDATE: { Icon: Pencil,       color: "text-blue-600 bg-blue-50" },
  DELETE: { Icon: Trash2,       color: "text-red-500 bg-red-50" },
};

const RESOURCE_LABELS = {
  activities: "l'activité",
  users:      "l'utilisateur",
  partners:   "le partenaire",
  devices:    "le dispositif",
};

const ACTION_VERBS = {
  CREATE: "a ajouté",
  UPDATE: "a modifié",
  DELETE: "a supprimé",
};

const ROLE_LABELS = {
  partner: "Partenaire",
  coach:   "Coach",
  viewer:  "Lecteur",
};

function humanize(item) {
  const verb = ACTION_VERBS[item.action] || item.action;
  const resource = RESOURCE_LABELS[item.resource] || item.resource;
  const label = item.resource_label ? ` « ${item.resource_label} »` : "";
  return `${verb} ${resource}${label}`;
}

export default function NotificationBell() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ count: 0, items: [] });
  const dropRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await api.get("/audit-logs/notifications");
      setData(res.data);
    } catch {}
  }, [isAdmin]);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (!dropRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleToggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (data.count > 0) {
      try {
        await api.post("/audit-logs/notifications/seen");
        setData((prev) => ({ ...prev, count: 0 }));
      } catch {}
    }
  };

  if (!isAdmin) return null;

  const { count, items } = data;

  return (
    <div className="relative" ref={dropRef}>
      <button
        onClick={handleToggle}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 active:scale-90"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="anim-dropdown absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl z-[60] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-sm text-slate-800">Notifications</span>
            {items.length > 0 && (
              <span className="text-xs text-slate-400">{items.length} récente{items.length > 1 ? "s" : ""}</span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <CheckCheck className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Aucune activité récente</p>
              </div>
            ) : (
              items.map((item) => {
                const cfg = ACTION_CFG[item.action] ?? ACTION_CFG.UPDATE;
                const Icon = cfg.Icon;
                const roleLabel = ROLE_LABELS[item.user_role] || item.user_role;
                const ago = item.created_at
                  ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: fr })
                  : "";
                return (
                  <div key={item.id} className="flex gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {item.user_full_name || "—"}
                        <span className="font-normal text-slate-500"> ({roleLabel})</span>
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">{humanize(item)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{ago}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-2.5">
            <button
              onClick={() => { setOpen(false); navigate("/audit"); }}
              className="w-full text-center text-xs font-medium text-orange-600 hover:text-orange-700 transition-colors py-1"
            >
              Voir tous les journaux d'audit →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
