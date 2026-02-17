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
  const [search, setSearch] = useState("");

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
                    <label className="text-sm font-medium">Telephone</label>
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
                    Objectif beneficiaires
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

        <div className="card p-4">
          <div className="relative max-w-xl">
            <input
              type="text"
              className="input pl-10"
              placeholder="Rechercher un partenaire..."
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

        {filteredPartners.length === 0 && (
          <div className="card p-8 text-center text-slate-500">
            Aucun partenaire enregistre
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredPartners.map((p) => {
            const objective = Number(p.objective_beneficiaries || 0);
            const activities = Number(p.activities_count || 0);
            const beneficiaries = Number(p.beneficiaries_count || 0);
            const pct =
              objective > 0
                ? Math.min(100, Math.round((beneficiaries / objective) * 100))
                : 0;
            return (
              <div key={p.id} className="card p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{p.name}</p>
                      <span
                        className={`badge mt-1 ${
                          p.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {p.status === "active" ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
      </div>
    </AdminPinGate>
  );
}
