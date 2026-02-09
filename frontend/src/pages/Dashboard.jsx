import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Calendar,
  Users,
  Building2,
  Clock,
  TrendingUp,
  AlertTriangle,
  MapPin,
  Download,
  FileDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import api from "../api";
import { useAuth } from "../auth/useAuth";

const markerIcon = new L.Icon({
  iconUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [0, -34],
  shadowSize: [41, 41],
});

export default function Dashboard() {
  const { role, user } = useAuth();
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [partners, setPartners] = useState([]);
  const [devices, setDevices] = useState([]);
  const [geoPoints, setGeoPoints] = useState([]);
  const [geoBoundary, setGeoBoundary] = useState(null);
  const kpiRef = useRef(null);
  const [filters, setFilters] = useState({
    year: currentYear,
    partner_id: "",
    device_id: "",
    gender: "",
  });

  useEffect(() => {
    Promise.all([api.get("/partners"), api.get("/devices")])
      .then(([p, d]) => {
        setPartners(p.data || []);
        setDevices(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (role === "partner" && user?.partner_id) {
      setFilters((prev) => ({
        ...prev,
        partner_id: String(user.partner_id),
      }));
    }
  }, [role, user]);

  useEffect(() => {
    const params = { year: filters.year };
    if (filters.partner_id) params.partner_id = filters.partner_id;
    if (filters.device_id) params.device_id = filters.device_id;
    if (filters.gender) params.gender = filters.gender;

    setLoading(true);
    api
      .get("/dashboard/summary", { params })
      .then((res) => {
        setSummary(res.data);
        setError("");
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          "Erreur lors du chargement";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const yearOptions = [
    currentYear,
    currentYear - 1,
    currentYear - 2,
  ];

  const partnerOptions =
    role === "partner" && user?.partner_id
      ? partners.filter((p) => p.id === user.partner_id)
      : partners;

  const handleExport = async () => {
    try {
      setExporting(true);
      const params = { year: filters.year };
      if (filters.partner_id) params.partner_id = filters.partner_id;
      if (filters.device_id) params.device_id = filters.device_id;
      if (filters.gender) params.gender = filters.gender;

      const res = await api.get("/dashboard/export", {
        params,
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `dashboard_objectifs_${filters.year}.csv`;
      link.click();
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!kpiRef.current) return;
    try {
      setExportingPdf(true);
      const canvas = await html2canvas(kpiRef.current, {
        scale: 2,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgWidth = pageWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 10, 10, imgWidth, imgHeight);
      pdf.save(`dashboard_kpis_${filters.year}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  };

  useEffect(() => {
    const locations = summary?.locations || [];
    if (!locations.length) {
      setGeoPoints([]);
      return;
    }

    let cancelled = false;
    const cacheKey = "odc_location_cache_v1";
    const cached =
      JSON.parse(localStorage.getItem(cacheKey) || "{}") || {};

    const resolve = async () => {
      const points = [];
      for (const loc of locations) {
        const name = loc.name;
        if (!name || name.toLowerCase() === "non renseignÃ©") continue;
        if (cached[name]) {
          points.push({ ...cached[name], name, value: loc.value });
          continue;
        }
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
              `${name}, Senegal`
            )}`
          );
          const data = await res.json();
          if (data?.[0]) {
            const point = {
              lat: parseFloat(data[0].lat),
              lng: parseFloat(data[0].lon),
            };
            cached[name] = point;
            points.push({ ...point, name, value: loc.value });
          }
        } catch (_) {
          // ignore geocode failure
        }
      }
      localStorage.setItem(cacheKey, JSON.stringify(cached));
      if (!cancelled) setGeoPoints(points);
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, [summary]);

  useEffect(() => {
    if (geoBoundary) return;
      const url =
        "https://raw.githubusercontent.com/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/SEN/ADM1/geoBoundaries-SEN-ADM1_simplified.geojson";
    fetch(url)
      .then((res) => res.json())
      .then((data) => setGeoBoundary(data))
      .catch(() => {});
  }, [geoBoundary]);

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-2xl bg-white/80 shadow animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 rounded-2xl bg-white/80 shadow animate-pulse" />
          <div className="h-80 rounded-2xl bg-white/80 shadow animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="card p-4 border border-red-200 bg-red-50 text-red-700">
          <p className="text-sm font-medium">Erreur dashboard</p>
          <p className="text-sm">{error}</p>
        </div>
      )}
      <div className="card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-500">Année</label>
              <select
                className="select mt-1"
                value={filters.year}
                onChange={(e) =>
                  setFilters({ ...filters, year: Number(e.target.value) })
                }
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Partenaire</label>
              <select
                className="select mt-1"
                value={filters.partner_id}
                onChange={(e) =>
                  setFilters({ ...filters, partner_id: e.target.value })
                }
                disabled={role === "partner"}
              >
                <option value="">Tous</option>
                {partnerOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Dispositif</label>
              <select
                className="select mt-1"
                value={filters.device_id}
                onChange={(e) =>
                  setFilters({ ...filters, device_id: e.target.value })
                }
              >
                <option value="">Tous</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500">Genre</label>
              <select
                className="select mt-1"
                value={filters.gender}
                onChange={(e) =>
                  setFilters({ ...filters, gender: e.target.value })
                }
              >
                <option value="">Tous</option>
                <option value="H">Hommes</option>
                <option value="F">Femmes</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="w-4 h-4" />
              {exporting ? "Export..." : "Exporter objectifs"}
            </button>
            <button
              className="btn-ghost border"
              onClick={handleExportPdf}
              disabled={exportingPdf}
            >
              <FileDown className="w-4 h-4" />
              {exportingPdf ? "PDF..." : "Exporter KPIs"}
            </button>
          </div>
        </div>
      </div>

      <div
        ref={kpiRef}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <KpiCard
          label="Activités"
          value={summary?.totals?.activities ?? 0}
          icon={Calendar}
          accent="bg-orange-100 text-orange-600"
        />
        <KpiCard
          label="Participants"
          value={summary?.totals?.participants ?? 0}
          icon={Users}
          accent="bg-green-100 text-green-600"
        />
        <KpiCard
          label="Partenaires actifs"
          value={summary?.totals?.partners_active ?? 0}
          icon={Building2}
          accent="bg-blue-100 text-blue-600"
        />
        <KpiCard
          label="Heures de formation"
          value={`${summary?.totals?.hours ?? 0}h`}
          icon={Clock}
          accent="bg-purple-100 text-purple-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TrendsLineChart data={summary?.trends || []} />
        <TopListCard
          title="Top dispositifs"
          items={summary?.top?.devices || []}
        />
        <TopListCard
          title="Top partenaires"
          items={summary?.top?.partners || []}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityBarChart
          data={summary?.beneficiariesByDevice || []}
          title="Bénéficiaires par dispositif"
        />
        <BeneficiaryPieChart
          data={summary?.gender || []}
          title="Répartition par genre"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BeneficiariesByPartnerTable
          data={summary?.beneficiariesByPartner || []}
        />

        <div className="lg:col-span-2 card p-3">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <TrendingUp className="w-5 h-5 text-orange-500" />
            Activités récentes
          </h3>
          <div className="mt-3 space-y-2">
            {(summary?.recentActivities || []).map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-2 bg-slate-50 rounded-xl"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {activity.title}
                  </p>
                  <p className="text-sm text-slate-500">
                    {activity.partner_name || activity.partner || "-"}
                  </p>
                </div>
                <div className="text-right">
                  <span className="badge bg-orange-100 text-orange-700">
                    {activity.activity_date
                      ? format(
                          new Date(activity.activity_date),
                          "dd MMM",
                          { locale: fr }
                        )
                      : "-"}
                  </span>
                </div>
              </div>
            ))}
            {(summary?.recentActivities || []).length === 0 && (
              <p className="text-center text-slate-500 py-4">
                Aucune activité récente
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <AlertsCard alerts={summary?.alerts} />
        <DataQualityCard data={summary?.dataQuality} />
        <LocationsMap data={summary?.locations || []} points={geoPoints} geoBoundary={geoBoundary} />
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-3xl font-bold text-slate-900">{value}</p>
        </div>
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent}`}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

function TrendsLineChart({ data }) {
  const formatted = data.map((d) => ({
    ...d,
    monthLabel: d.month
      ? format(new Date(`${d.month}-01`), "MMM", { locale: fr })
      : "-",
  }));

  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900">Tendances</h3>
      {formatted.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-slate-400">
          Aucune donnée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={formatted}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="monthLabel" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="activities"
              stroke="#F97316"
              strokeWidth={2}
              name="Activités"
            />
            <Line
              type="monotone"
              dataKey="beneficiaries"
              stroke="#10B981"
              strokeWidth={2}
              name="Bénéficiaires"
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TopListCard({ title, items }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="text-slate-500">Aucune donnée</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              className="flex items-center justify-between"
            >
              <span className="text-slate-700">{item.name}</span>
              <span className="font-semibold text-slate-900">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BeneficiariesByPartnerTable({ data }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900">
        Objectifs par partenaire
      </h3>
      <div className="overflow-x-auto">
        <table className="table border-separate border-spacing-y-2 w-full">
          <thead className="table-head">
            <tr>
              <th className="text-left p-4">Partenaire</th>
              <th className="text-right p-4">Réalisé</th>
              <th className="text-right p-4">Objectif</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const percent =
                row.objective > 0
                  ? Math.min(
                      100,
                      Math.round((row.value / row.objective) * 100)
                    )
                  : 0;
              return (
                <tr key={row.name} className="table-row">
                  <td className="p-4 font-medium break-words">
                    {row.name}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <span>{row.value}</span>
                      <div className="relative w-9 h-9">
                        <svg
                          viewBox="0 0 36 36"
                          className="w-9 h-9 -rotate-90"
                          aria-hidden="true"
                        >
                          <circle
                            cx="18"
                            cy="18"
                            r="16"
                            fill="none"
                            stroke="rgb(241 245 249)"
                            strokeWidth="4"
                          />
                          <circle
                            cx="18"
                            cy="18"
                            r="16"
                            fill="none"
                            stroke="rgb(249 115 22)"
                            strokeWidth="4"
                            strokeLinecap="round"
                            strokeDasharray="100"
                            strokeDashoffset={100 - percent}
                          />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-700">
                          {percent}%
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right">{row.objective}</td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="text-center p-6 text-slate-500"
                >
                  Aucun partenaire enregistré
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActivityBarChart({ data, title }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900">{title}</h3>
      {data.every((d) => d.value === 0) ? (
        <div className="h-[260px] flex items-center justify-center text-slate-400">
          Aucune donnée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval={0}
              angle={-25}
              textAnchor="end"
              height={60}
            />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value">
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function BeneficiaryPieChart({ data, title }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900">{title}</h3>
      {data.every((d) => d.value === 0) ? (
        <div className="h-[260px] flex items-center justify-center text-slate-400">
          Aucune donnée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function AlertsCard({ alerts }) {
  const partners = alerts?.partners || [];
  const devices = alerts?.devices || [];

  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-orange-500" />
        Alertes
      </h3>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-slate-500 mb-2">
            Partenaires sous 50% d'objectif
          </p>
          {partners.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucune alerte</p>
          ) : (
            partners.map((p, idx) => (
              <div
                key={`${p.name}-${idx}`}
                className="flex items-center justify-between text-sm"
              >
                <span>{p.name}</span>
                <span className="text-orange-600 font-semibold">
                  {p.percent}%
                </span>
              </div>
            ))
          )}
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-2">
            Dispositifs sans activité récente (60j)
          </p>
          {devices.length === 0 ? (
            <p className="text-slate-500 text-sm">Aucune alerte</p>
          ) : (
            devices.map((d, idx) => (
              <div
                key={`${d.name}-${idx}`}
                className="flex items-center justify-between text-sm"
              >
                <span>{d.name}</span>
                <span className="text-slate-500">
                  {d.last_activity
                    ? format(new Date(d.last_activity), "dd/MM/yyyy")
                    : "-"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DataQualityCard({ data }) {
  const dq = data || {};
  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900">Qualité</h3>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span>Contacts manquants</span>
          <span className="font-semibold text-slate-900">
            {dq.missing_contact_pct || 0}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Genre manquant</span>
          <span className="font-semibold text-slate-900">
            {dq.missing_gender_pct || 0}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Activités sans dispositif</span>
          <span className="font-semibold text-slate-900">
            {dq.activities_missing_device_pct || 0}%
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Activités sans partenaire</span>
          <span className="font-semibold text-slate-900">
            {dq.activities_missing_partner_pct || 0}%
          </span>
        </div>
      </div>
    </div>
  );
}

function LocationsMap({ data, points, geoBoundary }) {
  const SENEGAL_CENTER = [14.4974, -14.4524];
  const SENEGAL_BOUNDS = [
    [12.3, -17.6],
    [16.9, -11.3],
  ];
  const center = points[0]
    ? [points[0].lat, points[0].lng]
    : SENEGAL_CENTER;

  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-4 text-slate-900 flex items-center gap-2">
        <MapPin className="w-5 h-5 text-orange-500" />
        Carte des lieux
      </h3>
      <div className="h-72 w-full overflow-hidden rounded-xl">
        <MapContainer
          center={center}
          zoom={points.length ? 6 : 6}
          className="h-full w-full"
          scrollWheelZoom={false}
          maxBounds={SENEGAL_BOUNDS}
          maxBoundsViscosity={1.0}
          minZoom={6}
          maxZoom={10}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.length === 0 && geoBoundary && (
            <GeoJSON
              data={geoBoundary}
              style={{
                color: "#F97316",
                weight: 1,
                fillColor: "#FED7AA",
                fillOpacity: 0.25,
              }}
            />
          )}
          {points.length > 0 && geoBoundary && (
            <GeoJSON
              data={geoBoundary}
              style={{
                color: "#E11D48",
                weight: 1,
                fillColor: "#FFE4E6",
                fillOpacity: 0.2,
              }}
            />
          )}
          {points.map((p, idx) => (
            <Marker
              key={`${p.name}-${idx}`}
              position={[p.lat, p.lng]}
              icon={markerIcon}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{p.name}</p>
                  <p>{p.value} bénéficiaires</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Limites administratives: geoBoundaries (gbOpen).
      </p>
      {data.length === 0 && (
        <p className="text-slate-500 mt-3">Aucune donnée</p>
      )}
      {data.length > 0 && points.length === 0 && (
        <p className="text-slate-500 mt-3">
          Coordonnées en cours de récupération...
        </p>
      )}
    </div>
  );
}

