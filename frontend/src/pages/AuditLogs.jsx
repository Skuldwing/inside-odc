import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

const ACTION_LABELS = {
  CREATE: { label: "Création", bg: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  UPDATE: { label: "Modification", bg: "bg-blue-100 text-blue-700 border-blue-200" },
  DELETE: { label: "Suppression", bg: "bg-red-100 text-red-700 border-red-200" },
};

const RESOURCE_LABELS = {
  activities: "Activités",
  users: "Utilisateurs",
  partners: "Partenaires",
  devices: "Dispositifs",
};

const ROLE_LABELS = {
  admin: "Admin",
  partner: "Partenaire",
  coach: "Coach",
  viewer: "Lecteur",
};

function ActionBadge({ action }) {
  const cfg = ACTION_LABELS[action] ?? { label: action, bg: "bg-slate-100 text-slate-600 border-slate-200" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.bg}`}>
      {cfg.label}
    </span>
  );
}

function DetailsRow({ details }) {
  const [open, setOpen] = useState(false);
  const mods = details?.modifications && typeof details.modifications === "object"
    ? Object.entries(details.modifications)
    : null;
  const extras = Object.entries(details ?? {}).filter(([k, v]) => k !== "modifications" && v != null && v !== "");
  const hasContent = (mods && mods.length > 0) || extras.length > 0;
  if (!hasContent) return <span className="text-slate-400">—</span>;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "Masquer" : "Voir détails"}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs space-y-2">
          {mods && mods.length > 0 && (
            <div>
              <p className="font-semibold text-slate-600 mb-1.5">Champs modifiés :</p>
              <div className="space-y-1">
                {mods.map(([field, change]) => (
                  <div key={field} className="flex items-start gap-2 font-mono">
                    <span className="shrink-0 w-28 text-slate-400 truncate">{field}</span>
                    <span className="line-through text-red-400 truncate max-w-[90px]">{change?.avant ?? "—"}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-emerald-600 truncate max-w-[90px]">{change?.apres ?? "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {extras.length > 0 && (
            <div className={`space-y-1 font-mono ${mods && mods.length > 0 ? "border-t border-slate-200 pt-2" : ""}`}>
              {extras.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-slate-400 shrink-0">{k}:</span>
                  <span className="text-slate-700 break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AuditLogs() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    resource: "",
    action: "",
    user_id: "",
    from: "",
    to: "",
    search: "",
  });

  const [page, setPage] = useState(0);
  const LIMIT = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: LIMIT, offset: page * LIMIT };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await axios.get(`${API}/audit-logs`, { params, withCredentials: true });
      setRows(res.data.rows);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }

  function resetFilters() {
    setFilters({ resource: "", action: "", user_id: "", from: "", to: "", search: "" });
    setPage(0);
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-orange-500" />
            Journaux d'audit
          </h1>
          <p className="page-subtitle">Historique de toutes les modifications sur la plateforme</p>
        </div>
        <button
          onClick={fetchLogs}
          className="btn btn-ghost gap-2"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </button>
      </div>

      {/* Filtres */}
      <div className="card-solid p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Ressource */}
          <select
            className="select text-sm"
            value={filters.resource}
            onChange={(e) => setFilter("resource", e.target.value)}
          >
            <option value="">Toutes les ressources</option>
            {Object.entries(RESOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          {/* Action */}
          <select
            className="select text-sm"
            value={filters.action}
            onChange={(e) => setFilter("action", e.target.value)}
          >
            <option value="">Toutes les actions</option>
            <option value="CREATE">Création</option>
            <option value="UPDATE">Modification</option>
            <option value="DELETE">Suppression</option>
          </select>

          {/* Recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              className="input pl-8 text-sm"
              placeholder="Rechercher..."
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
            />
          </div>

          {/* Date début */}
          <input
            type="date"
            className="input text-sm"
            value={filters.from}
            onChange={(e) => setFilter("from", e.target.value)}
          />

          {/* Date fin */}
          <input
            type="date"
            className="input text-sm"
            value={filters.to}
            onChange={(e) => setFilter("to", e.target.value)}
          />

          {/* Reset */}
          <button
            onClick={resetFilters}
            disabled={!hasFilters}
            className="btn btn-ghost text-sm disabled:opacity-40"
          >
            <X className="w-4 h-4" />
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Compteur */}
      <p className="text-sm text-slate-500">
        {loading ? "Chargement..." : `${total} entrée${total !== 1 ? "s" : ""} trouvée${total !== 1 ? "s" : ""}`}
      </p>

      {/* Table */}
      <div className="card-solid overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Date / Heure</th>
                <th className="px-4 py-3">Utilisateur</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Ressource</th>
                <th className="px-4 py-3">Élément</th>
                <th className="px-4 py-3">Détails</th>
                <th className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                    Aucun journal trouvé
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="table-row text-sm">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                    {row.created_at
                      ? format(parseISO(row.created_at), "dd/MM/yyyy HH:mm", { locale: fr })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.user_full_name ?? "—"}</div>
                    <div className="text-xs text-slate-400">{ROLE_LABELS[row.user_role] ?? row.user_role ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={row.action} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {RESOURCE_LABELS[row.resource] ?? row.resource}
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-slate-700" title={row.resource_label}>
                    {row.resource_label ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <DetailsRow details={row.details} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                    {row.ip_address ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > LIMIT && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {page + 1} sur {Math.ceil(total / LIMIT)}
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-ghost text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </button>
              <button
                className="btn btn-ghost text-xs"
                disabled={(page + 1) * LIMIT >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
