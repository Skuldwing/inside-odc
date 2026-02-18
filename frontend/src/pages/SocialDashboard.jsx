import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Users,
  Radio,
  UserRoundCheck,
  Target,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import api from "../api";

const platformLabel = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
};

const platformColors = {
  facebook: "#1877F2",
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  x: "#111827",
  tiktok: "#14B8A6",
};

function formatCompact(value) {
  const n = Number(value || 0);
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1)}B`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function SocialDashboard() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get("/social-dashboard/summary", { params: { year } })
      .then((res) => setSummary(res.data))
      .catch((err) =>
        setError(err?.response?.data?.error || "Erreur chargement dashboard social")
      )
      .finally(() => setLoading(false));
  }, [year]);

  const years = [currentYear, currentYear - 1, currentYear - 2];
  const monthly = summary?.monthly || [];

  const followersBar = useMemo(
    () =>
      monthly.map((m) => ({
        ...m,
        month_label: m.month?.slice(5, 7) || "-",
      })),
    [monthly]
  );

  const distribution = (summary?.platform_distribution || []).map((d) => ({
    ...d,
    name: platformLabel[d.name] || d.name,
    color: platformColors[d.name] || "#F97316",
  }));

  const cards = summary?.cards || {};

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-orange-500 to-orange-600 text-white border-none shadow-xl shadow-orange-300/60">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Social Media Performance {year}</h1>
            <p className="text-orange-100 mt-1">
              Vue consolidée des performances Facebook, Instagram, LinkedIn, X et TikTok
            </p>
          </div>
          <select
            className="select max-w-[180px] bg-white text-slate-900"
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
      </div>

      {error && (
        <div className="card p-4 border border-red-200 bg-red-50 text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <SocialCard
          icon={Users}
          label="Portee"
          value={formatCompact(cards.followers?.value)}
          growth={cards.followers?.growth_pct}
        />
        <SocialCard
          icon={Radio}
          label="Engagement"
          value={formatCompact(cards.engagement?.value)}
          growth={cards.engagement?.growth_pct}
        />
        <SocialCard
          icon={UserRoundCheck}
          label="Audience unique"
          value={formatCompact(cards.unique_users?.value)}
          growth={cards.unique_users?.growth_pct}
        />
        <SocialCard
          icon={Target}
          label="Resultats"
          value={formatCompact(cards.results?.value)}
          growth={cards.results?.growth_pct}
        />
        <SocialCard
          icon={BarChart3}
          label="Portee totale"
          value={formatCompact(cards.reach?.value)}
          growth={cards.reach?.growth_pct}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <h3 className="font-semibold text-slate-900 mb-3">
            Evolution globale des followers (Janvier a Decembre)
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            Croissance cumulée de l’ensemble des plateformes.
          </p>
          <div className="h-72">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400">Chargement...</div>
            ) : followersBar.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400">Aucune donnee</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={followersBar}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month_label" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="followers" fill="#F97316" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Repartition par plateforme</h3>
          <div className="h-72">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400">Chargement...</div>
            ) : distribution.length === 0 || distribution.every((d) => d.value === 0) ? (
              <div className="h-full flex items-center justify-center text-slate-400">Aucune donnee</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distribution}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={70}
                    outerRadius={98}
                  >
                    {distribution.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-2 mt-2">
            {distribution.map((p) => (
              <div key={p.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                  <span>{p.name}</span>
                </div>
                <span className="font-semibold">{formatCompact(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-slate-900 mb-4">
          Tendances KPI social dans le temps
        </h3>
        <div className="h-80">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400">Chargement...</div>
          ) : monthly.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400">Aucune donnee</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="reach" stroke="#F97316" strokeWidth={2} name="Portee" />
                <Line type="monotone" dataKey="engagement" stroke="#10B981" strokeWidth={2} name="Engagement" />
                <Line type="monotone" dataKey="results" stroke="#3B82F6" strokeWidth={2} name="Resultats" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {(summary?.latest_by_platform || []).map((p) => (
          <div key={p.platform} className="card p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">
              {platformLabel[p.platform] || p.platform}
            </p>
            <p className="text-3xl font-bold mt-2" style={{ color: platformColors[p.platform] || "#F97316" }}>
              {formatCompact(p.followers)}
            </p>
            <p className="text-xs text-slate-500">Followers</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialCard({ icon: Icon, label, value, growth }) {
  const positive = Number(growth || 0) >= 0;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="w-4 h-4 text-orange-500" />
      </div>
      <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
      <p className={`text-xs mt-1 ${positive ? "text-green-600" : "text-red-600"}`}>
        {positive ? "+" : ""}
        {Number(growth || 0)}% vs periode precedente
      </p>
    </div>
  );
}
