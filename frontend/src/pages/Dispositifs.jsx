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

export default function Dispositifs() {
  const devicesApi = api;

  const [devices, setDevices] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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

  return (
    <AdminPinGate>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dispositifs</h1>
          <p className="page-subtitle">
            Programmes et dispositifs ODC
          </p>
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
                <label className="text-sm font-medium">Catégorie</label>
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

      <div className="card overflow-x-auto">
        <table className="table">
          <thead className="table-head">
            <tr>
              <th className="text-left px-4 py-3">Dispositif</th>
              <th className="text-left px-4 py-3">Catégorie</th>
              <th className="text-left px-4 py-3">Couleur</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="table-row">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    <Layers className="w-4 h-4 text-orange-500" />
                    {d.name}
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    {d.description}
                  </p>
                </td>

                <td className="px-4 py-3">{d.category}</td>

                <td className="px-4 py-3">
                  <span
                    className="inline-block w-6 h-6 rounded-full border"
                    style={{ backgroundColor: d.color }}
                  />
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      d.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {d.status}
                  </span>
                </td>

                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEdit(d)}
                    className="text-slate-500 hover:text-orange-500 mr-2"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-slate-500 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}

            {devices.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">
                  Aucun dispositif enregistré
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </AdminPinGate>
  );
}
