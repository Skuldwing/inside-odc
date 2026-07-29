import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, Users, Radio, UserRoundCheck, Target,
  Plus, Pencil, Trash2, TrendingUp, Eye, X,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell,
  LineChart, Line, Legend,
} from "recharts";
import api from "../api";

/* ===== CONFIG PLATEFORMES ===== */
const PLATFORMS = [
  { value: "facebook",  label: "Facebook",  color: "#1877F2", bg: "#EBF3FE", short: "FB" },
  { value: "instagram", label: "Instagram", color: "#E1306C", bg: "#FDE8EF", short: "IG" },
  { value: "linkedin",  label: "LinkedIn",  color: "#0A66C2", bg: "#E7F0FA", short: "LI" },
  { value: "x",         label: "X",         color: "#111827", bg: "#F3F4F6", short: "X"  },
  { value: "tiktok",    label: "TikTok",    color: "#14B8A6", bg: "#E0F7F5", short: "TT" },
  { value: "youtube",   label: "YouTube",   color: "#FF0000", bg: "#FFE8E8", short: "YT" },
];
const platformMap = Object.fromEntries(PLATFORMS.map(p => [p.value, p]));

const MONTHS_SHORT = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

function formatCompact(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function PlatformBadge({ platform }) {
  const p = platformMap[platform];
  if (!p) return <span className="text-slate-400 text-xs">{platform}</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: p.bg, color: p.color }}
    >
      <span className="font-bold text-[10px] tracking-tight">{p.short}</span>
      {p.label}
    </span>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function KpiCard({ icon: Icon, label, value, growth, colorClass, loading }) {
  const positive = Number(growth || 0) >= 0;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-slate-500 font-medium leading-tight">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {loading
        ? <div className="h-8 w-20 bg-slate-100 rounded-lg animate-pulse" />
        : <p className="text-3xl font-bold text-slate-900">{value}</p>
      }
      <p className={`text-xs mt-1.5 font-medium ${positive ? "text-green-600" : "text-red-500"}`}>
        {positive ? "▲" : "▼"} {Math.abs(Number(growth || 0))}% vs an précédent
      </p>
    </div>
  );
}

function ChartLoading() {
  return <div className="h-full flex items-center justify-center text-slate-300 text-sm">Chargement...</div>;
}
function ChartEmpty() {
  return <div className="h-full flex items-center justify-center text-slate-300 text-sm">Aucune donnée</div>;
}

function NumField({ label, value, onChange }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <input
        type="number"
        min="0"
        className="input mt-1"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

/* ===================================================================== */
export default function SocialDashboard() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(currentYear);

  /* -- Vue d'ensemble -- */
  const [summary, setSummary] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState("");

  /* -- Données -- */
  const [rows, setRows] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    platform: "facebook",
    month_date: `${currentYear}-01`,
    followers: "", reach: "", engagement: "", unique_users: "", results: "",
  });

  const years = [currentYear, currentYear - 1, currentYear - 2];

  /* -- Chargements -- */
  useEffect(() => {
    setLoadingOverview(true);
    setOverviewError("");
    api.get("/social-dashboard/summary", { params: { year } })
      .then(res => setSummary(res.data))
      .catch(err => setOverviewError(err?.response?.data?.error || "Erreur chargement"))
      .finally(() => setLoadingOverview(false));
  }, [year]);

  const fetchRows = () => {
    setLoadingData(true);
    setDataError("");
    api.get("/social-kpis", { params: { year } })
      .then(res => setRows(res.data || []))
      .catch(err => setDataError(err?.response?.data?.error || "Erreur chargement"))
      .finally(() => setLoadingData(false));
  };

  useEffect(() => {
    if (tab === "data") fetchRows();
  }, [year, tab]);

  /* -- Données traitées -- */
  const monthly = summary?.monthly || [];
  const cards = summary?.cards || {};

  const followersBar = useMemo(() =>
    monthly.map(m => ({
      ...m,
      month_label: m.month
        ? MONTHS_SHORT[parseInt(m.month.slice(5, 7), 10) - 1]
        : "-",
    })), [monthly]
  );

  const distribution = useMemo(() =>
    (summary?.platform_distribution || [])
      .filter(d => d.value > 0)
      .map(d => ({
        ...d,
        displayName: platformMap[d.name]?.label || d.name,
        color: platformMap[d.name]?.color || "#F97316",
      })), [summary]
  );

  /* -- Handlers formulaire -- */
  const resetForm = () => {
    setForm({ platform: "facebook", month_date: `${year}-01`, followers: "", reach: "", engagement: "", unique_users: "", results: "" });
    setEditing(null);
  };

  const openNew = () => { resetForm(); setModalOpen(true); };

  const handleEdit = row => {
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
    setModalOpen(true);
  };

  const handleDelete = async id => {
    if (!confirm("Supprimer ce KPI social ?")) return;
    try {
      await api.delete(`/social-kpis/${id}`);
      fetchRows();
    } catch (err) {
      setDataError(err?.response?.data?.error || "Erreur suppression");
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setDataError("");
    try {
      const payload = {
        ...form,
        followers:    Number(form.followers || 0),
        reach:        Number(form.reach || 0),
        engagement:   Number(form.engagement || 0),
        unique_users: Number(form.unique_users || 0),
        results:      Number(form.results || 0),
      };
      if (editing) {
        await api.put(`/social-kpis/${editing}`, payload);
      } else {
        await api.post("/social-kpis", payload);
      }
      setModalOpen(false);
      resetForm();
      fetchRows();
    } catch (err) {
      setDataError(err?.response?.data?.error || "Erreur enregistrement");
    }
  };

  /* ================================================================= */
  return (
    <div className="space-y-6">

      {/* ===== HEADER ===== */}
      <div className="card p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white border-none shadow-xl overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle at 85% 40%, rgba(249,115,22,0.25) 0%, transparent 55%)",
        }} />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/40 flex-shrink-0">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Radar Social</h1>
            </div>
            <p className="text-slate-400 text-sm pl-12">
              {PLATFORMS.map(p => p.label).join(" · ")} — {year}
            </p>
          </div>
          <select
            className="select bg-slate-700/80 border-slate-600 text-white max-w-[140px]"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Onglets */}
        <div className="relative mt-5 flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
          <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
            <BarChart3 className="w-4 h-4" /> Vue d'ensemble
          </TabButton>
          <TabButton active={tab === "data"} onClick={() => setTab("data")}>
            <TrendingUp className="w-4 h-4" /> Données
          </TabButton>
        </div>
      </div>

      {/* ===== TAB : VUE D'ENSEMBLE ===== */}
      {tab === "overview" && (
        <>
          {overviewError && (
            <div className="card p-4 border border-red-200 bg-red-50 text-red-700 text-sm">{overviewError}</div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard icon={Users}          label="Followers"       value={formatCompact(cards.followers?.value)}    growth={cards.followers?.growth_pct}    colorClass="bg-orange-100 text-orange-600" loading={loadingOverview} />
            <KpiCard icon={Eye}            label="Portée"          value={formatCompact(cards.reach?.value)}        growth={cards.reach?.growth_pct}        colorClass="bg-blue-100 text-blue-600"   loading={loadingOverview} />
            <KpiCard icon={Radio}          label="Engagement"      value={formatCompact(cards.engagement?.value)}   growth={cards.engagement?.growth_pct}   colorClass="bg-green-100 text-green-600" loading={loadingOverview} />
            <KpiCard icon={UserRoundCheck} label="Audience unique" value={formatCompact(cards.unique_users?.value)} growth={cards.unique_users?.growth_pct} colorClass="bg-violet-100 text-violet-600" loading={loadingOverview} />
            <KpiCard icon={Target}         label="Résultats"       value={formatCompact(cards.results?.value)}      growth={cards.results?.growth_pct}      colorClass="bg-pink-100 text-pink-600"   loading={loadingOverview} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 card p-6">
              <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">Évolution des abonnés</h3>
              <div className="h-60">
                {loadingOverview ? <ChartLoading /> : followersBar.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={followersBar} barSize={22}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="month_label" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={40} />
                      <Tooltip formatter={(v) => formatCompact(v)} contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }} />
                      <Bar dataKey="followers" fill="#F97316" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">Répartition</h3>
              <div className="h-44">
                {loadingOverview ? <ChartLoading /> : distribution.length === 0 ? <ChartEmpty /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={distribution} dataKey="value" nameKey="displayName" innerRadius={50} outerRadius={72} paddingAngle={2} startAngle={90} endAngle={-270}>
                        {distribution.map(entry => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, name) => [formatCompact(v), name]} contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="space-y-2 mt-3">
                {distribution.map(p => (
                  <div key={p.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-slate-600">{p.displayName}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{formatCompact(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tendances */}
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">Tendances dans le temps</h3>
            <div className="h-60">
              {loadingOverview ? <ChartLoading /> : monthly.length === 0 ? <ChartEmpty /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={followersBar}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="month_label" tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: "#94A3B8" }} axisLine={false} tickLine={false} tickFormatter={formatCompact} width={40} />
                    <Tooltip formatter={(v) => formatCompact(v)} contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Line type="monotone" dataKey="reach"      stroke="#F97316" strokeWidth={2} dot={false} name="Portée" />
                    <Line type="monotone" dataKey="engagement" stroke="#10B981" strokeWidth={2} dot={false} name="Engagement" />
                    <Line type="monotone" dataKey="results"    stroke="#3B82F6" strokeWidth={2} dot={false} name="Résultats" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Plateformes — dernière valeur */}
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold mb-3">Abonnés par plateforme — dernier mois</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {(summary?.latest_by_platform || PLATFORMS.map(p => ({ platform: p.value, followers: 0 }))).map(p => {
                const cfg = platformMap[p.platform];
                if (!cfg) return null;
                return (
                  <div key={p.platform} className="card p-4 relative overflow-hidden group hover:shadow-md transition-shadow">
                    <div className="absolute inset-0 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity" style={{ backgroundColor: cfg.color }} />
                    <div className="relative">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mb-2"
                        style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                        {cfg.short}
                      </span>
                      <p className="text-2xl font-bold text-slate-900">{formatCompact(p.followers)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{cfg.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ===== TAB : DONNÉES ===== */}
      {tab === "data" && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Saisie mensuelle des KPI par plateforme</p>
            <button className="btn-primary" onClick={openNew}>
              <Plus className="w-4 h-4" /> Nouveau KPI
            </button>
          </div>

          {dataError && (
            <div className="card p-4 border border-red-200 bg-red-50 text-red-700 text-sm">{dataError}</div>
          )}

          {/* Mini résumé plateformes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {PLATFORMS.map(p => {
              const latest = rows.find(r => r.platform === p.value);
              return (
                <div key={p.value} className="card p-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mb-2"
                    style={{ backgroundColor: p.bg, color: p.color }}>
                    {p.short}
                  </span>
                  <p className="text-xl font-bold text-slate-900">
                    {latest ? formatCompact(latest.followers) : "—"}
                  </p>
                  <p className="text-xs text-slate-400">{p.label}</p>
                </div>
              );
            })}
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead className="table-head">
                  <tr>
                    <th className="px-4 py-3 text-left">Mois</th>
                    <th className="px-4 py-3 text-left">Plateforme</th>
                    <th className="px-4 py-3 text-right">Followers</th>
                    <th className="px-4 py-3 text-right">Portée</th>
                    <th className="px-4 py-3 text-right">Engagement</th>
                    <th className="px-4 py-3 text-right">Audience</th>
                    <th className="px-4 py-3 text-right">Résultats</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {loadingData && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Chargement...</td></tr>
                  )}
                  {!loadingData && rows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                      Aucun KPI enregistré pour {year}
                    </td></tr>
                  )}
                  {!loadingData && rows.map(row => {
                    const cfg = platformMap[row.platform];
                    return (
                      <tr key={row.id} className="table-row border-l-[3px]" style={{ borderLeftColor: cfg?.color || "#E2E8F0" }}>
                        <td className="px-4 py-3 text-slate-600 text-sm">{String(row.month_date).slice(0, 7)}</td>
                        <td className="px-4 py-3"><PlatformBadge platform={row.platform} /></td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCompact(row.followers)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 text-sm">{formatCompact(row.reach)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 text-sm">{formatCompact(row.engagement)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 text-sm">{formatCompact(row.unique_users)}</td>
                        <td className="px-4 py-3 text-right text-slate-600 text-sm">{formatCompact(row.results)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => handleEdit(row)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== MODAL FORMULAIRE ===== */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-6">
          <div className="card-solid w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 pb-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editing ? "Modifier un KPI" : "Nouveau KPI social"}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">Données mensuelles par plateforme</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Sélecteur plateforme visuel */}
              <div>
                <label className="text-sm font-medium text-slate-700">Plateforme</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {PLATFORMS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm({ ...form, platform: p.value })}
                      className="flex flex-col items-center py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition-all"
                      style={form.platform === p.value
                        ? { borderColor: p.color, backgroundColor: p.bg, color: p.color }
                        : { borderColor: "#E2E8F0", color: "#94A3B8", backgroundColor: "transparent" }}
                    >
                      <span className="font-bold text-sm mb-0.5">{p.short}</span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mois */}
              <div>
                <label className="text-sm font-medium text-slate-700">Mois</label>
                <input
                  type="month"
                  className="input mt-1"
                  value={form.month_date}
                  onChange={e => setForm({ ...form, month_date: e.target.value })}
                  required
                />
              </div>

              {/* Champs numériques */}
              <div className="grid grid-cols-2 gap-3">
                <NumField label="Followers"      value={form.followers}    onChange={v => setForm({ ...form, followers: v })} />
                <NumField label="Portée"          value={form.reach}        onChange={v => setForm({ ...form, reach: v })} />
                <NumField label="Engagement"      value={form.engagement}   onChange={v => setForm({ ...form, engagement: v })} />
                <NumField label="Audience unique" value={form.unique_users} onChange={v => setForm({ ...form, unique_users: v })} />
                <NumField label="Résultats"       value={form.results}      onChange={v => setForm({ ...form, results: v })} />
              </div>

              {dataError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">{dataError}</p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" className="btn-ghost border" onClick={() => setModalOpen(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary">
                  {editing ? "Mettre à jour" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
