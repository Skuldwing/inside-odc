import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Megaphone } from "lucide-react";
import api from "../api";

const platforms = [
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "x", label: "X" },
  { value: "tiktok", label: "TikTok" },
];

function formatCompact(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function SocialKpis() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    platform: "facebook",
    month_date: `${currentYear}-01`,
    followers: "",
    reach: "",
    engagement: "",
    unique_users: "",
    results: "",
  });

  const years = [currentYear, currentYear - 1, currentYear - 2];

  const fetchRows = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/social-kpis", { params: { year } });
      setRows(res.data || []);
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur chargement KPI social");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, [year]);

  const latestFollowersByPlatform = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.platform)) {
        map.set(row.platform, Number(row.followers || 0));
      }
    }
    return platforms.map((p) => ({
      ...p,
      followers: map.get(p.value) || 0,
    }));
  }, [rows]);

  const resetForm = () => {
    setForm({
      platform: "facebook",
      month_date: `${year}-01`,
      followers: "",
      reach: "",
      engagement: "",
      unique_users: "",
      results: "",
    });
    setEditing(null);
  };

  const handleEdit = (row) => {
    setForm({
      platform: row.platform,
      month_date: String(row.month_date).slice(0, 7),
      followers: row.followers ?? "",
      reach: row.reach ?? "",
      engagement: row.engagement ?? "",
      unique_users: row.unique_users ?? "",
      results: row.results ?? "",
    });
    setEditing(row.id);
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce KPI social ?")) return;
    try {
      await api.delete(`/social-kpis/${id}`);
      fetchRows();
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur suppression KPI social");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const payload = {
        ...form,
        followers: Number(form.followers || 0),
        reach: Number(form.reach || 0),
        engagement: Number(form.engagement || 0),
        unique_users: Number(form.unique_users || 0),
        results: Number(form.results || 0),
      };
      if (editing) {
        await api.put(`/social-kpis/${editing}`, payload);
      } else {
        await api.post("/social-kpis", payload);
      }
      setOpen(false);
      resetForm();
      fetchRows();
    } catch (err) {
      setError(err?.response?.data?.error || "Erreur enregistrement KPI social");
    }
  };

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">KPIs Social Media</h1>
            <p className="page-subtitle">
              Enregistrement mensuel des performances Facebook, Instagram, LinkedIn, X et TikTok
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Nouveau KPI
          </button>
        </div>

        <div className="card p-4 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="w-5 h-5 text-orange-500" />
            <p className="text-sm text-slate-600">Filtrer les saisies par année</p>
          </div>
          <select
            className="select max-w-xs"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {latestFollowersByPlatform.map((p) => (
            <div key={p.value} className="card p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">{p.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{formatCompact(p.followers)}</p>
              <p className="text-xs text-slate-500">Followers (dernier mois saisi)</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="card p-4 border border-red-200 bg-red-50 text-red-700">{error}</div>
        )}

        <div className="card overflow-x-auto">
          <table className="table">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3 text-left">Mois</th>
                <th className="px-4 py-3 text-left">Plateforme</th>
                <th className="px-4 py-3 text-right">Followers</th>
                <th className="px-4 py-3 text-right">Portee</th>
                <th className="px-4 py-3 text-right">Engagement</th>
                <th className="px-4 py-3 text-right">Audience unique</th>
                <th className="px-4 py-3 text-right">Resultats</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    Chargement...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                    Aucun KPI enregistre pour {year}
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id} className="table-row">
                    <td className="px-4 py-3">{String(row.month_date).slice(0, 7)}</td>
                    <td className="px-4 py-3 font-medium">
                      {platforms.find((p) => p.value === row.platform)?.label || row.platform}
                    </td>
                    <td className="px-4 py-3 text-right">{row.followers}</td>
                    <td className="px-4 py-3 text-right">{row.reach}</td>
                    <td className="px-4 py-3 text-right">{row.engagement}</td>
                    <td className="px-4 py-3 text-right">{row.unique_users}</td>
                    <td className="px-4 py-3 text-right">{row.results}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => handleEdit(row)}
                          className="text-slate-500 hover:text-orange-500"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {open && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="card-solid w-full max-w-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">
                {editing ? "Modifier KPI social" : "Nouveau KPI social"}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Plateforme</label>
                    <select
                      className="select mt-1"
                      value={form.platform}
                      onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    >
                      {platforms.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Mois</label>
                    <input
                      type="month"
                      className="input mt-1"
                      value={form.month_date}
                      onChange={(e) => setForm({ ...form, month_date: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <Field
                    label="Followers"
                    value={form.followers}
                    onChange={(v) => setForm({ ...form, followers: v })}
                  />
                  <Field
                    label="Portee"
                    value={form.reach}
                    onChange={(v) => setForm({ ...form, reach: v })}
                  />
                  <Field
                    label="Engagement"
                    value={form.engagement}
                    onChange={(v) => setForm({ ...form, engagement: v })}
                  />
                  <Field
                    label="Audience unique"
                    value={form.unique_users}
                    onChange={(v) => setForm({ ...form, unique_users: v })}
                  />
                  <Field
                    label="Resultats"
                    value={form.results}
                    onChange={(v) => setForm({ ...form, results: v })}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    className="btn-ghost border"
                    onClick={() => setOpen(false)}
                  >
                    Annuler
                  </button>
                  <button type="submit" className="btn-primary">
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <input
        type="number"
        min="0"
        className="input mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
