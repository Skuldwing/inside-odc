import { useEffect, useCallback, useState, useRef } from "react";
import { Users, Search, Download, Filter, UserRound, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { EmptyState, DensityToggle, useDensity, useToast } from "../components/ui";
import { useAuth } from "../auth/useAuth";

/* La date arrivait telle que la rend pg — « 2026-09-08T00:00:00.000Z » —
   c'est-a-dire un horodatage brut, illisible dans un tableau. */
function formatDate(value) {
  if (!value) return "-";
  try {
    return format(parseISO(String(value)), "d MMM yyyy", { locale: fr });
  } catch {
    return String(value).slice(0, 10);
  }
}

export default function Participants() {
  const { isCompact } = useDensity();
  const { isViewer } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [searchParams] = useSearchParams();

  const [search, setSearch]           = useState(searchParams.get("q") || "");
  const [genderFilter, setGenderFilter] = useState("");
  const [page, setPage]               = useState(1);

  const [rows, setRows]               = useState([]);
  const [total, setTotal]             = useState(0);
  const [stats, setStats]             = useState({ male: 0, female: 0 });
  const [pages, setPages]             = useState(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  /* Debounce search → réinitialise la page */
  const debounceRef = useRef(null);
  const debouncedSearch = useRef(search);

  const fetchPage = useCallback(async (searchVal, genreVal, pageVal) => {
    setLoading(true);
    setError("");
    try {
      const params = { page: pageVal };
      if (searchVal) params.search = searchVal;
      if (genreVal)  params.genre  = genreVal;
      const res = await api.get("/participants", { params });
      const d   = res.data;
      setRows(d.rows || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
      setStats({ male: d.male || 0, female: d.female || 0 });
    } catch {
      setError("Erreur de chargement des participants.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* Chargement initial */
  useEffect(() => {
    fetchPage(search, genderFilter, page);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Filtre genre → reset page 1 */
  const handleGenre = (val) => {
    setGenderFilter(val);
    setPage(1);
    fetchPage(debouncedSearch.current, val, 1);
  };

  /* Recherche avec debounce 350ms → reset page 1 */
  const handleSearch = (val) => {
    setSearch(val);
    debouncedSearch.current = val;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPage(val, genderFilter, 1);
    }, 350);
  };

  /* Changement de page */
  const goToPage = (p) => {
    setPage(p);
    fetchPage(debouncedSearch.current, genderFilter, p);
  };

  /* Export CSV.
     Il etait construit a partir de `rows`, c'est-a-dire la seule page
     affichee : au-dela de 100 lignes le fichier etait silencieusement
     incomplet. Le serveur le produit desormais sur l'ensemble des lignes
     correspondant aux filtres en cours. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = {};
      if (debouncedSearch.current) params.search = debouncedSearch.current;
      if (genderFilter) params.genre = genderFilter;

      const res = await api.get("/participants/export.csv", {
        params,
        responseType: "blob",
      });

      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        res.headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1] ||
        "participants-odc.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      /* Liberation differee : Safari annule le telechargement si l'URL est
         revoquee trop tot. */
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      const count = res.headers["x-total-count"];
      toast.success(
        count
          ? `${Number(count).toLocaleString("fr-FR")} participant(s) exporté(s).`
          : "Export terminé."
      );
    } catch (err) {
      console.error("Erreur export participants", err);
      toast.error("L'export n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="surface-glass p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Base unifiée</p>
            <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
              Participants / Bénéficiaires
            </h1>
            <p className="mt-1 text-sm text-slate-500">Suivi complet des profils issus des activités.</p>
          </div>
          {!isViewer && (
            <button onClick={exportCsv} className="btn-primary" disabled={exporting || total === 0}>
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              {exporting
                ? "Export en cours…"
                : `Exporter CSV${total ? ` (${total.toLocaleString("fr-FR")})` : ""}`}
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total filtrés"  value={total} />
        <StatCard label="Hommes"         value={stats.male} />
        <StatCard label="Femmes"         value={stats.female} />
      </section>

      <section className="card p-4 lg:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-slate-700">
          <Filter className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Recherche et filtres</h2>
          <DensityToggle className="ml-auto" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Rechercher nom, activité, partenaire..."
              className="input pl-10"
            />
          </div>
          <select className="select" value={genderFilter} onChange={(e) => handleGenre(e.target.value)}>
            <option value="">Tous les genres</option>
            <option value="H">Hommes</option>
            <option value="F">Femmes</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">{error}</div>
      )}

      <section className="card overflow-x-auto">
        <table className="table">
          <thead className="table-head">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Prénom</th>
              <th className="p-3">Structure/Etablissement</th>
              <th className="p-3">Genre</th>
              <th className="p-3">Tranche d'âge</th>
              <th className="p-3">Email</th>
              <th className="p-3">Telephone</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Activité</th>
              <th className="p-3">Date</th>
              <th className="p-3">Partenaire</th>
              <th className="p-3">Dispositif</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="text-center p-8 text-slate-500">Chargement...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={12}>
                  <EmptyState
                    bare
                    icon={Users}
                    title="Aucun participant trouvé"
                    description="Les participants apparaissent ici dès qu'une liste de présences est importée sur une activité."
                  />
                </td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={`${p.id}_${p.activity_id ?? i}`} className="table-row">
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"} font-medium`}>{p.nom || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.prenom || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.structure || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>
                    <span className={`badge ${
                      p.genre === "H"
                        ? "bg-blue-100 border-blue-200 text-blue-700"
                        : "bg-pink-100 border-pink-200 text-pink-700"
                    }`}>
                      {p.genre || "-"}
                    </span>
                  </td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.age_range || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.email || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.telephone || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.statut || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.activite || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{formatDate(p.date_activite)}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.partenaire || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.dispositif || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Page {page} / {pages} — {total} résultat{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                let p;
                if (pages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= pages - 3) {
                  p = pages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    disabled={loading}
                    className={`min-w-[32px] h-8 rounded-lg text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-orange-500 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= pages || loading}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-orange-500" />
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
