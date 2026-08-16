import { useEffect, useCallback, useState, useRef } from "react";
import { Users, Search, Download, Filter, UserRound, ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth/useAuth";

function escapeCsvCell(value) {
  const text = value == null ? "" : String(value).replace(/"/g, '""');
  if (/[;"\n]/.test(text)) return `"${text}"`;
  return text;
}

export default function Participants() {
  const { isViewer } = useAuth();
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

  /* Export CSV de la page courante */
  const exportExcel = () => {
    const headers = [
      "Nom","Prénom","Structure/Etablissement","Genre","Tranche d'âge",
      "Email","Telephone","Statut","Activité","Date activite","Partenaire","Dispositif",
    ];
    const csvRows = rows.map((p) => [
      p.nom, p.prenom, p.structure, p.genre, p.age_range,
      p.email, p.telephone, p.statut, p.activite, p.date_activite, p.partenaire, p.dispositif,
    ]);
    const csv = [headers, ...csvRows].map((r) => r.map(escapeCsvCell).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "participants_odc.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      <section className="surface-glass p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Base unifiée</p>
            <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
              Participants / Bénéficiaires
            </h1>
            <p className="mt-1 text-sm text-slate-500">Suivi complet des profils issus des activites.</p>
          </div>
          {!isViewer && (
            <button onClick={exportExcel} className="btn-primary">
              <Download className="w-4 h-4" />
              Exporter CSV (page)
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
        <div className="flex items-center gap-2 text-slate-700 mb-4">
          <Filter className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Recherche et filtres</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
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
                <td colSpan={12} className="text-center p-8 text-slate-500">
                  <Users className="mx-auto mb-2 text-slate-300" />
                  Aucun participant trouvé
                </td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={`${p.id}_${p.activity_id ?? i}`} className="table-row">
                  <td className="p-3 font-medium">{p.nom || "-"}</td>
                  <td className="p-3">{p.prenom || "-"}</td>
                  <td className="p-3">{p.structure || "-"}</td>
                  <td className="p-3">
                    <span className={`badge ${
                      p.genre === "H"
                        ? "bg-blue-100 border-blue-200 text-blue-700"
                        : "bg-pink-100 border-pink-200 text-pink-700"
                    }`}>
                      {p.genre || "-"}
                    </span>
                  </td>
                  <td className="p-3">{p.age_range || "-"}</td>
                  <td className="p-3">{p.email || "-"}</td>
                  <td className="p-3">{p.telephone || "-"}</td>
                  <td className="p-3">{p.statut || "-"}</td>
                  <td className="p-3">{p.activite || "-"}</td>
                  <td className="p-3">{p.date_activite || "-"}</td>
                  <td className="p-3">{p.partenaire || "-"}</td>
                  <td className="p-3">{p.dispositif || "-"}</td>
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
