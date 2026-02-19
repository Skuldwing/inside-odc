import { useEffect, useMemo, useState } from "react";
import { Users, Search, Download, Filter, UserRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import api from "../api";
import { useAuth } from "../auth/useAuth";

function toSafeText(value) {
  return value == null ? "" : String(value);
}

function escapeCsvCell(value) {
  const text = toSafeText(value).replace(/"/g, '""');
  if (/[;"\n]/.test(text)) return `"${text}"`;
  return text;
}

export default function Participants() {
  const { isViewer } = useAuth();
  const [searchParams] = useSearchParams();
  const querySearch = searchParams.get("q") || "";

  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchParticipants = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/participants");
      setParticipants(res.data || []);
    } catch {
      setError("Erreur de chargement des participants.");
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  useEffect(() => {
    setSearch(querySearch);
  }, [querySearch]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants.filter((p) => {
      if (genderFilter && (p.genre || "") !== genderFilter) return false;
      if (!q) return true;
      return (
        (p.nom || "").toLowerCase().includes(q) ||
        (p.prenom || "").toLowerCase().includes(q) ||
        (p.activite || "").toLowerCase().includes(q) ||
        (p.partenaire || "").toLowerCase().includes(q) ||
        (p.dispositif || "").toLowerCase().includes(q)
      );
    });
  }, [participants, search, genderFilter]);

  const stats = useMemo(() => {
    const male = filtered.filter((p) => p.genre === "H").length;
    const female = filtered.filter((p) => p.genre === "F").length;
    return {
      total: filtered.length,
      male,
      female,
    };
  }, [filtered]);

  const exportExcel = () => {
    const headers = [
      "Nom",
      "Prenom",
      "Genre",
      "Tranche d age",
      "Email",
      "Telephone",
      "Statut",
      "Activite",
      "Date activite",
      "Partenaire",
      "Dispositif",
    ];

    const rows = filtered.map((p) => [
      p.nom,
      p.prenom,
      p.genre,
      p.age_range,
      p.email,
      p.telephone,
      p.statut,
      p.activite,
      p.date_activite,
      p.partenaire,
      p.dispositif,
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map(escapeCsvCell).join(";"))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });

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
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Base unifiee
            </p>
            <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
              Participants / Beneficiaires
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Suivi complet des profils issus des activites.
            </p>
          </div>

          {!isViewer && (
            <button onClick={exportExcel} className="btn-primary">
              <Download className="w-4 h-4" />
              Exporter CSV
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total filtres" value={stats.total} />
        <StatCard label="Hommes" value={stats.male} />
        <StatCard label="Femmes" value={stats.female} />
      </section>

      <section className="card p-4 lg:p-5">
        <div className="flex items-center gap-2 text-slate-700">
          <Filter className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">
            Recherche et filtres
          </h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher nom, activite, partenaire..."
              className="input pl-10"
            />
          </div>
          <select
            className="select"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
          >
            <option value="">Tous les genres</option>
            <option value="H">Hommes</option>
            <option value="F">Femmes</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">
          {error}
        </div>
      )}

      <section className="card overflow-x-auto">
        <table className="table">
          <thead className="table-head">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Prenom</th>
              <th className="p-3">Genre</th>
              <th className="p-3">Tranche d age</th>
              <th className="p-3">Email</th>
              <th className="p-3">Telephone</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Activite</th>
              <th className="p-3">Date</th>
              <th className="p-3">Partenaire</th>
              <th className="p-3">Dispositif</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="text-center p-8 text-slate-500">
                  Chargement...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center p-8 text-slate-500">
                  <Users className="mx-auto mb-2 text-slate-300" />
                  Aucun participant trouve
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="p-3 font-medium">{p.nom || "-"}</td>
                  <td className="p-3">{p.prenom || "-"}</td>
                  <td className="p-3">
                    <span
                      className={`badge ${
                        p.genre === "H"
                          ? "bg-blue-100 border-blue-200 text-blue-700"
                          : "bg-pink-100 border-pink-200 text-pink-700"
                      }`}
                    >
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
