import { useEffect, useState } from "react";
import { Plus, Layers, Pencil, Trash2, Palette } from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";

const categories = [
  "formation",
  "hackathon",
  "programme",
  "evenement",
  "autre",
];

const categoryLabels = {
  formation: "Formation",
  hackathon: "Hackathon",
  programme: "Programme",
  evenement: "Evenement",
  autre: "Autre",
};

export default function Dispositifs() {
  const devicesApi = api;

  const [devices, setDevices] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "formation",
    color: "#FF7900",
    status: "active",
  });

  const fetchDevices = async () => {
    try {
      const res = await devicesApi.get("/devices");
      setDevices(res.data);
    } catch (err) {
      console.error("Erreur chargement dispositifs", err);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      category: "formation",
      color: "#FF7900",
      status: "active",
    });
    setEditing(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editing) {
        await devicesApi.put(`/devices/${editing}`, form);
      } else {
        await devicesApi.post("/devices", form);
      }

      fetchDevices();
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Erreur enregistrement", err);
    }
  };

  const handleEdit = (device) => {
    setForm({
      name: device.name,
      description: device.description,
      category: device.category,
      color: device.color,
      status: device.status,
    });
    setEditing(device.id);
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce dispositif ?")) return;

    try {
      await devicesApi.delete(`/devices/${id}`);
      fetchDevices();
    } catch (err) {
      console.error("Erreur suppression", err);
    }
  };

  const filteredDevices = devices.filter((d) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      d.name?.toLowerCase().includes(needle) ||
      d.description?.toLowerCase().includes(needle) ||
      d.category?.toLowerCase().includes(needle)
    );
  });

  return (
    <AdminPinGate>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Dispositifs</h1>
            <p className="page-subtitle">Gerez les programmes et initiatives</p>
          </div>

          <button
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Nouveau dispositif
          </button>
        </div>

        {open && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="card-solid w-full max-w-lg p-6">
              <h2 className="text-xl font-semibold mb-4">
                {editing ? "Modifier le dispositif" : "Nouveau dispositif"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Nom *</label>
                  <input
                    required
                    className="input mt-1"
                    value={form.name}
                    onChange={(e) =>
                      setForm({ ...form, name: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    rows="3"
                    className="input mt-1"
                    value={form.description}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        description: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Categorie</label>
                  <select
                    className="select mt-1"
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Palette className="w-4 h-4" /> Couleur
                  </label>
                  <input
                    type="color"
                    className="w-full h-10 mt-1"
                    value={form.color}
                    onChange={(e) =>
                      setForm({ ...form, color: e.target.value })
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
            </div>
          </div>
        )}

        <div className="card p-4">
          <div className="relative max-w-xl">
            <input
              type="text"
              className="input pl-10"
              placeholder="Rechercher un dispositif..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </span>
          </div>
        </div>

        {filteredDevices.length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            Aucun dispositif enregistre
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredDevices.map((d) => {
            const categoryLabel = categoryLabels[d.category] || d.category || "Autre";
            const activities = Number(d.activities_count || 0);
            const beneficiaries = Number(d.beneficiaries_count || 0);
            return (
              <div key={d.id} className="card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl text-white flex items-center justify-center"
                      style={{ backgroundColor: d.color || "#FF7900" }}
                    >
                      <Layers className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{d.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="badge bg-blue-100 text-blue-700">
                          {categoryLabel}
                        </span>
                        <span
                          className={`badge ${
                            d.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {d.status === "active" ? "Actif" : "Inactif"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(d)}
                      className="text-slate-500 hover:text-orange-500"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-slate-500 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-500">
                  {d.description || "Aucune description"}
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-xs text-slate-500 mb-1">Activites</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {activities}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-3">
                    <p className="text-xs text-slate-500 mb-1">Beneficiaires</p>
                    <p className="text-xl font-semibold text-slate-900">
                      {beneficiaries}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AdminPinGate>
  );
}
