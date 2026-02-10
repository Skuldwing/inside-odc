import { useEffect, useState } from "react";
import {
  Plus,
  Building2,
  Mail,
  Phone,
  Target,
  Pencil,
  Trash2,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";

export default function Partenaires() {
  const partnersApi = api;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [partners, setPartners] = useState([]);

  const [form, setForm] = useState({
    name: "",
    description: "",
    contact_email: "",
    contact_phone: "",
    objective_beneficiaries: "",
    status: "active",
  });

  const fetchPartners = async () => {
    try {
      const res = await partnersApi.get("/partners");
      setPartners(res.data);
    } catch (err) {
      console.error("Erreur chargement partenaires", err);
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
    setEditing(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      ...form,
      objective_beneficiaries: Number(form.objective_beneficiaries || 0),
    };

    try {
      if (editing) {
        await partnersApi.put(`/partners/${editing}`, payload);
      } else {
        await partnersApi.post("/partners", payload);
      }

      fetchPartners();
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Erreur enregistrement partenaire", err);
    }
  };

  const handleEdit = (partner) => {
    setForm({
      name: partner.name || "",
      description: partner.description || "",
      contact_email: partner.contact_email || "",
      contact_phone: partner.contact_phone || "",
      objective_beneficiaries: partner.objective_beneficiaries ?? "",
      status: partner.status || "active",
    });
    setEditing(partner.id);
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer ce partenaire ?")) return;

    try {
      await partnersApi.delete(`/partners/${id}`);
      fetchPartners();
    } catch (err) {
      console.error("Erreur suppression partenaire", err);
    }
  };

  return (
    <AdminPinGate>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Partenaires</h1>
          <p className="page-subtitle">
            Gestion des partenaires Orange Digital Center
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
          Nouveau partenaire
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card-solid w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {editing ? "Modifier le partenaire" : "Nouveau partenaire"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom *</label>
                <input
                  required
                  className="input mt-1"
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      name: e.target.value,
                    })
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <input
                    type="email"
                    className="input mt-1"
                    value={form.contact_email}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        contact_email: e.target.value,
                      })
                    }
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Téléphone</label>
                  <input
                    className="input mt-1"
                    value={form.contact_phone}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        contact_phone: e.target.value,
                      })
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
                    setForm({
                      ...form,
                      status: e.target.value,
                    })
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
              <th className="text-left px-4 py-3">Partenaire</th>
              <th className="text-left px-4 py-3">Contact</th>
              <th className="text-left px-4 py-3">Objectif</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-medium">
                    <Building2 className="w-4 h-4 text-orange-500" />
                    {p.name}
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    {p.description}
                  </p>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {p.contact_email && (
                    <div className="flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      {p.contact_email}
                    </div>
                  )}
                  {p.contact_phone && (
                    <div className="flex items-center gap-1 mt-1">
                      <Phone className="w-4 h-4" />
                      {p.contact_phone}
                    </div>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <Target className="w-4 h-4 text-orange-500" />
                    {p.objective_beneficiaries}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      p.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>

                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEdit(p)}
                    className="text-slate-500 hover:text-orange-500 mr-2"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-slate-500 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}

            {partners.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">
                  Aucun partenaire enregistré
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
