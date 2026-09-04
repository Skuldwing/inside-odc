import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Building2,
  Mail,
  Phone,
  Target,
  Pencil,
  Trash2,
  Layers,
  Users,
  LayoutGrid,
  Columns3,
  ArrowUpRight,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";
import AdminModal from "../components/admin/AdminModal";
import AdminPageHeader from "../components/admin/AdminPageHeader";
import AdminSearchCard from "../components/admin/AdminSearchCard";

const PIPELINE_STAGES = [
  { key: "prospect", label: "Prospect", dot: "bg-slate-400" },
  { key: "actif", label: "Actif", dot: "bg-emerald-500" },
  { key: "a_relancer", label: "À relancer", dot: "bg-amber-500" },
  { key: "dormant", label: "Dormant", dot: "bg-slate-300" },
];

export default function Partenaires() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [partners, setPartners] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("cartes");
  const [draggedId, setDraggedId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    contact_email: "",
    contact_phone: "",
    objective_beneficiaries: "",
    status: "active",
  });
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);

  const fetchPartners = async () => {
    try {
      const [pRes, dRes] = await Promise.all([
        api.get("/partners"),
        api.get("/devices"),
      ]);
      setPartners(pRes.data);
      setAllDevices(dRes.data);
    } catch (err) {
      console.error("Erreur chargement partenaires", err);
    }
    try {
      const uRes = await api.get("/users");
      setCoaches((uRes.data || []).filter(u => u.role === "coach"));
    } catch {
      /* coachs non disponibles, section masquée */
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      contact_email: "",
      contact_phone: "",
      objective_beneficiaries: "",
      status: "active",
    });
    setSelectedDeviceIds([]);
    setEditing(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      objective_beneficiaries: Number(form.objective_beneficiaries || 0),
    };

    try {
      let partnerId = editing;
      if (editing) {
        await api.put(`/partners/${editing}`, payload);
      } else {
        const res = await api.post("/partners", payload);
        partnerId = res.data.id;
      }

      await api.put(`/partners/${partnerId}/devices`, {
        device_ids: selectedDeviceIds,
      });

      fetchPartners();
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Erreur enregistrement partenaire", err);
    }
  };

  const handleEdit = async (partner) => {
    setForm({
      name: partner.name || "",
      description: partner.description || "",
      contact_email: partner.contact_email || "",
      contact_phone: partner.contact_phone || "",
      objective_beneficiaries: partner.objective_beneficiaries ?? "",
      status: partner.status || "active",
    });
    setEditing(partner.id);

    try {
      const res = await api.get(`/partners/${partner.id}/devices`);
      setSelectedDeviceIds(res.data);
    } catch {
      setSelectedDeviceIds([]);
    }

    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce partenaire ?")) return;
    try {
      await api.delete(`/partners/${id}`);
      fetchPartners();
    } catch (err) {
      console.error("Erreur suppression partenaire", err);
    }
  };

  const handlePipelineStageChange = async (partnerId, pipeline_stage) => {
    const previous = partners;
    setPartners((prev) =>
      prev.map((p) => (p.id === partnerId ? { ...p, pipeline_stage } : p))
    );
    try {
      await api.patch(`/partners/${partnerId}/pipeline-stage`, { pipeline_stage });
    } catch (err) {
      console.error("Erreur changement de stade", err);
      setPartners(previous);
    }
  };

  const toggleDevice = (deviceId) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId)
        ? prev.filter((id) => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const filteredPartners = partners.filter((p) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      p.name?.toLowerCase().includes(needle) ||
      p.description?.toLowerCase().includes(needle) ||
      p.contact_email?.toLowerCase().includes(needle)
    );
  });

  return (
    <AdminPinGate>
      <div className="space-y-6">
        <AdminPageHeader
          title="Partenaires"
          subtitle="Gestion des partenaires Orange Digital Center"
          buttonLabel="Nouveau partenaire"
          buttonIcon={Plus}
          onAdd={() => {
            resetForm();
            setOpen(true);
          }}
        />

        <div className="inline-flex rounded-xl border border-slate-200 bg-white overflow-hidden">
          <button
            onClick={() => setViewMode("cartes")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
              viewMode === "cartes" ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Cartes
          </button>
          <button
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
              viewMode === "kanban" ? "bg-orange-500 text-white" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Columns3 className="w-4 h-4" />
            Pipeline
          </button>
        </div>

        {open && (
          <AdminModal
            title={editing ? "Modifier le partenaire" : "Nouveau partenaire"}
            onClose={() => setOpen(false)}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom *</label>
                <input
                  required
                  className="input mt-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  rows="3"
                  className="input mt-1"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    className="input mt-1"
                    value={form.contact_email}
                    onChange={(e) =>
                      setForm({ ...form, contact_email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Téléphone</label>
                  <input
                    className="input mt-1"
                    value={form.contact_phone}
                    onChange={(e) =>
                      setForm({ ...form, contact_phone: e.target.value })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Objectif bénéficiaires
                </label>
                <input
                  type="number"
                  className="input mt-1"
                  value={form.objective_beneficiaries}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      objective_beneficiaries: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Statut</label>
                <select
                  className="select mt-1"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value })
                  }
                >
                  <option value="active">Actif</option>
                  <option value="inactive">Inactif</option>
                </select>
              </div>

              {/* Dispositifs assignés */}
              {allDevices.length > 0 && (
                <div>
                  <label className="text-sm font-medium flex items-center gap-1 mb-2">
                    <Layers className="w-4 h-4 text-orange-500" />
                    Dispositifs accessibles
                  </label>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {allDevices.map((d) => {
                      const checked = selectedDeviceIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleDevice(d.id)}
                            className="w-4 h-4 accent-orange-500"
                          />
                          <span
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: d.color || "#FF7900",
                            }}
                          />
                          <span className="text-sm text-slate-700 flex-1">
                            {d.name}
                          </span>
                          {d.category && (
                            <span className="text-xs text-slate-400">
                              {d.category}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  {selectedDeviceIds.length > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      {selectedDeviceIds.length} dispositif
                      {selectedDeviceIds.length > 1 ? "s" : ""} sélectionné
                      {selectedDeviceIds.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost border"
                >
                  Annuler
                </button>
                <button type="submit" className="btn-primary">
                  Enregistrer
                </button>
              </div>
            </form>
          </AdminModal>
        )}

        <AdminSearchCard
          placeholder="Rechercher un partenaire..."
          value={search}
          onChange={setSearch}
        />

        {filteredPartners.length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            Aucun partenaire enregistré
          </div>
        )}

        {viewMode === "kanban" && filteredPartners.length > 0 && (
          <PartnersKanban
            partners={filteredPartners}
            draggedId={draggedId}
            setDraggedId={setDraggedId}
            onStageChange={handlePipelineStageChange}
          />
        )}

        {viewMode === "cartes" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredPartners.map((p) => {
            const objective = Number(p.objective_beneficiaries || 0);
            const activities = Number(p.activities_count || 0);
            const beneficiaries = Number(p.beneficiaries_count || 0);
            const pct =
              objective > 0
                ? Math.min(100, Math.round((beneficiaries / objective) * 100))
                : 0;
            const partnerCoaches = coaches.filter(c => String(c.partner_id) === String(p.id));
            const coachesAllocated = Number(p.coaches_objective_allocated || 0);
            const coachesCount = Number(p.coaches_count || 0);
            const allocPct = objective > 0 ? Math.min(100, Math.round((coachesAllocated / objective) * 100)) : 0;

            return (
              <div key={p.id} className="card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span
                          className={`badge ${
                            p.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {p.status === "active" ? "Actif" : "Inactif"}
                        </span>
                        <span className="badge bg-slate-100 text-slate-600 flex items-center gap-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            PIPELINE_STAGES.find((s) => s.key === p.pipeline_stage)?.dot || "bg-slate-400"
                          }`} />
                          {PIPELINE_STAGES.find((s) => s.key === p.pipeline_stage)?.label || "Actif"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/partenaires/${p.id}`}
                      title="Voir la fiche"
                      className="text-slate-500 hover:text-orange-500"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleEdit(p)}
                      className="text-slate-500 hover:text-orange-500"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-slate-500 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-500">
                  {p.description || "Aucune description"}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-xs text-slate-500 mb-1">Activités</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {activities}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-xs text-slate-500 mb-1">Bénéficiaires</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {beneficiaries}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-orange-500" />
                      Objectif
                    </div>
                    <span>
                      {beneficiaries} / {objective}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full mt-2">
                    <div
                      className="h-2 bg-orange-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-right text-xs text-orange-600 mt-1">
                    {pct}%
                  </div>
                </div>

                {/* Répartition objectif → coachs */}
                {partnerCoaches.length > 0 && (
                  <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-purple-700 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        Coachs affiliés
                      </span>
                      {objective > 0 && (
                        <span className={`text-xs font-semibold ${coachesAllocated > objective ? "text-red-500" : "text-purple-600"}`}>
                          {coachesAllocated} / {objective} alloués
                        </span>
                      )}
                    </div>

                    {/* Barre globale */}
                    {objective > 0 && (
                      <div className="w-full h-1.5 bg-purple-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${coachesAllocated > objective ? "bg-red-400" : "bg-purple-400"}`}
                          style={{ width: `${allocPct}%` }}
                        />
                      </div>
                    )}

                    {/* Liste par coach */}
                    <div className="space-y-1.5">
                      {partnerCoaches.map(coach => {
                        const coachObj = Number(coach.objective_beneficiaries || 0);
                        const coachPct = objective > 0 && coachObj > 0
                          ? Math.min(100, Math.round((coachObj / objective) * 100))
                          : 0;
                        return (
                          <div key={coach.id} className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-purple-200 text-purple-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {(coach.full_name || "?")[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="text-xs text-slate-700 truncate">{coach.full_name || coach.email}</span>
                                <span className="text-[11px] text-purple-600 font-medium ml-2 flex-shrink-0">
                                  {coachObj > 0 ? `${coachObj} bénéf.` : "—"}
                                </span>
                              </div>
                              {objective > 0 && coachObj > 0 && (
                                <div className="w-full h-1 bg-purple-100 rounded-full">
                                  <div
                                    className="h-full bg-purple-400 rounded-full"
                                    style={{ width: `${coachPct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {objective > 0 && coachesAllocated < objective && (
                      <p className="text-[11px] text-purple-400">
                        {objective - coachesAllocated} bénéficiaire{objective - coachesAllocated > 1 ? "s" : ""} non encore attribué{objective - coachesAllocated > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 space-y-2 text-sm text-slate-600">
                  {p.contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      {p.contact_email}
                    </div>
                  )}
                  {p.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      {p.contact_phone}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </AdminPinGate>
  );
}

function PartnersKanban({ partners, draggedId, setDraggedId, onStageChange }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {PIPELINE_STAGES.map((stage) => {
        const stagePartners = partners.filter(
          (p) => (p.pipeline_stage || "actif") === stage.key
        );
        return (
          <div
            key={stage.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (draggedId != null) onStageChange(draggedId, stage.key);
              setDraggedId(null);
            }}
            className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 min-h-[200px]"
          >
            <div className="flex items-center gap-2 px-1 mb-3">
              <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
              <p className="text-sm font-semibold text-slate-700">{stage.label}</p>
              <span className="ml-auto text-xs text-slate-400">{stagePartners.length}</span>
            </div>
            <div className="space-y-2">
              {stagePartners.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => setDraggedId(p.id)}
                  onDragEnd={() => setDraggedId(null)}
                  className={`card-solid p-3 cursor-grab active:cursor-grabbing transition-opacity ${
                    draggedId === p.id ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <Link
                      to={`/partenaires/${p.id}`}
                      className="text-slate-400 hover:text-orange-500 shrink-0"
                      title="Voir la fiche"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {Number(p.activities_count || 0)} activité{Number(p.activities_count || 0) !== 1 ? "s" : ""} ·{" "}
                    {Number(p.beneficiaries_count || 0)} bénéficiaires
                  </p>
                </div>
              ))}
              {stagePartners.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">Aucun partenaire</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
