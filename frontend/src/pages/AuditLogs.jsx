import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { EmptyState } from "../components/ui";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

const ACTION_LABELS = {
  CREATE: { label: "Création", bg: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  UPDATE: { label: "Modification", bg: "bg-blue-100 text-blue-700 border-blue-200" },
  DELETE: { label: "Suppression", bg: "bg-red-100 text-red-700 border-red-200" },
};

/* Les noms lisibles des ressources journalisées. La liste déroulante se
   remplit désormais depuis le journal lui-même — une liste écrite à la main
   dérive dès que le code enregistre autre chose, et c'est ce qui était
   arrivé : elle n'en proposait que quatre sur une vingtaine, et les retraits
   d'inscription, justement, n'y figuraient pas. Ce tableau ne sert plus qu'à
   traduire ; ce qu'il ne connaît pas s'affiche tel quel. */
const RESOURCE_LABELS = {
  activities: "Activités",
  activity_participants: "Inscriptions aux activités",
  participants: "Participants",
  import_participants: "Imports de listes",
  users: "Utilisateurs",
  partners: "Partenaires",
  devices: "Dispositifs",
  forms: "Formulaires",
  public_form: "Formulaires publics",
  checkin_public: "Émargements publics",
  modeles_attestation: "Modèles d'attestation",
  attestations_envoyees: "Attestations envoyées",
  attestations_terminees: "Attestations réglées",
  attestation_ponctuelle: "Attestations ponctuelles",
  photo: "Photos",
  profil: "Profils",
  informations: "Informations",
  app_settings: "Réglages",
  mbootay_projects: "Projets Mbootay",
  reliability_reject_manual: "Fiabilité — rejet manuel",
  reliability_reset_auto: "Fiabilité — remise à zéro",
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
  if (!hasContent) return <span className="text-slate-500">—</span>;

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
                    <span className="shrink-0 w-28 text-slate-500 truncate">{field}</span>
                    <span className="line-through text-red-400 truncate max-w-[90px]">{change?.avant ?? "—"}</span>
                    <span className="text-slate-500">→</span>
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
                  <span className="text-slate-500 shrink-0">{k}:</span>
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

  /* Les ressources réellement présentes dans le journal, avec leur nombre de
     lignes : on ne propose pas un filtre qui ne rendrait rien. */
  const [ressources, setRessources] = useState([]);
  useEffect(() => {
    axios.get(`${API}/audit-logs/ressources`, { withCredentials: true })
      .then((r) => setRessources(r.data || []))
      .catch(() => setRessources([]));
  }, []);

  /* Les filtres de l'écran, prêts à partir : le fichier doit contenir ce
     qu'on regarde, sinon il ne répond pas à la question qu'on se pose. */
  const parametresActifs = () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    return params;
  };

  /* Remet le fichier à l'utilisateur. */
  const enregistrer = (blob, nom) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Libération différée : Safari annule le téléchargement si l'URL est
       révoquée trop tôt. */
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  /* Le même CSV, mais fabriqué ici, en relisant la liste page par page.
     Le serveur sait le produire — c'est plus rapide et ça n'occupe pas le
     navigateur — mais tant qu'il n'a pas repris le code, sa route répond
     404 et le bouton ne faisait rien. Plutôt que d'attendre un
     redéploiement, on retombe sur ce que l'ancienne version sait déjà
     servir : la liste paginée, qui existe depuis toujours. */
  /* Les mêmes colonnes que le serveur, dans le même ordre : les deux fichiers
     doivent être interchangeables, sinon celui de secours ne se relit pas
     comme l'autre. */
  const EN_TETES = [
    "N° journal", "Date", "Heure", "Auteur", "Rôle", "Action", "Ressource",
    "Identifiant", "Libellé", "Détail", "Adresse IP",
  ];

  const cellule = (valeur) => {
    if (valeur === null || valeur === undefined) return "";
    let t = typeof valeur === "object" ? JSON.stringify(valeur) : String(valeur);
    /* Une cellule commençant par =, +, - ou @ est lue comme une formule par
       Excel : on la neutralise. */
    if (/^[=+\-@]/.test(t)) t = `'${t}`;
    t = t.replace(/"/g, '""');
    return /[;"\n\r]/.test(t) ? `"${t}"` : t;
  };

  const fabriquerCsv = async (params) => {
    const PAS = 200;
    const morceaux = [EN_TETES.map(cellule).join(";")];
    let depart = 0;
    let total = Infinity;
    /* Garde-fou : un journal très long ne doit pas bloquer le navigateur
       indéfiniment si quelque chose se passe mal côté pagination. */
    while (depart < total && depart < 50000) {
      const r = await axios.get(`${API}/audit-logs`, {
        params: { ...params, limit: PAS, offset: depart },
        withCredentials: true,
      });
      total = r.data.total ?? 0;
      const lignes = r.data.rows || [];
      if (!lignes.length) break;
      for (const l of lignes) {
        const d = l.created_at ? new Date(l.created_at) : null;
        morceaux.push([
          l.id,
          d ? d.toISOString().slice(0, 10) : "",
          d ? d.toISOString().slice(11, 19) : "",
          l.user_full_name, l.user_role, l.action, l.resource,
          l.resource_id, l.resource_label, l.details, l.ip_address,
        ].map(cellule).join(";"));
      }
      depart += lignes.length;
    }
    /* BOM : sans lui, Excel lit le fichier en ANSI et casse les accents. */
    return new Blob(["﻿" + morceaux.join("\r\n") + "\r\n"],
      { type: "text/csv;charset=utf-8;" });
  };

  const [export_, setExport] = useState(false);
  const [erreurExport, setErreurExport] = useState("");
  const telecharger = async () => {
    setExport(true);
    setErreurExport("");
    const params = parametresActifs();
    const nomParDefaut = `journal-audit-odc-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const res = await axios.get(`${API}/audit-logs/export.csv`, {
        params, withCredentials: true, responseType: "blob",
      });
      enregistrer(
        res.data,
        res.headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1] || nomParDefaut
      );
    } catch (err) {
      console.error("Erreur export journal", err);
      /* Le serveur ne sait pas produire le fichier : on le fabrique ici. */
      try {
        enregistrer(await fabriquerCsv(params), nomParDefaut);
      } catch (err2) {
        console.error("Erreur export journal (repli)", err2);
        /* Un bouton qui ne fait rien ne se distingue pas d'un bouton cassé :
           on dit ce qui s'est passé. */
        setErreurExport(
          "Le téléchargement n'a pas abouti. Réessayez dans un instant ; " +
          "si cela persiste, signalez-le à l'équipe technique."
        );
      }
    } finally {
      setExport(false);
    }
  };

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
      {/* Deux boutons plutôt qu'un : sur un écran de téléphone ils ne tiennent
          plus à côté du titre, et la page se mettait à défiler de côté. Ils
          passent donc à la ligne, et le titre garde sa largeur. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 flex-shrink-0 text-orange-500" />
            Journaux d'audit
          </h1>
          <p className="page-subtitle">Historique de toutes les modifications sur la plateforme</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchLogs}
            className="btn btn-ghost gap-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Rafraîchir
          </button>
          {/* Le téléchargement suit les filtres : ce qui est affiché est ce
              qui part dans le fichier. Le nombre le rappelle, pour qu'on ne
              croie pas emporter tout le journal quand on a filtré. */}
          <button
            onClick={telecharger}
            className="btn btn-primary gap-2"
            disabled={export_ || total === 0}
            title="Télécharger les lignes affichées au format CSV"
          >
            {export_
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            {export_ ? "Préparation…" : `Télécharger (${total.toLocaleString("fr-FR")})`}
          </button>
        </div>
      </div>

      {/* Un bouton qui ne fait rien ne se distingue pas d'un bouton cassé. */}
      {erreurExport && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{erreurExport}</span>
        </div>
      )}

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
            {ressources.map(({ resource, n }) => (
              <option key={resource} value={resource}>
                {RESOURCE_LABELS[resource] ?? resource} ({n})
              </option>
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              className="input pl-8 text-sm"
              placeholder="Nom, auteur, activité…"
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
                  <td colSpan={7}>
                    <EmptyState
                      bare
                      icon={ShieldCheck}
                      title="Aucun journal sur cette période"
                      description="Les créations, modifications et suppressions apparaissent ici au fil de l'activité de la plateforme."
                    />
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
                    <div className="text-xs text-slate-500">{ROLE_LABELS[row.user_role] ?? row.user_role ?? "—"}</div>
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
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">
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
