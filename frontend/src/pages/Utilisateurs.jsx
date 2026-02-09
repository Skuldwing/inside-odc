import { useEffect, useState } from "react";
import {
  Plus,
  User,
  Mail,
  Shield,
  Building2,
  Pencil,
  Trash2,
} from "lucide-react";
import api from "../api";

const roles = [
  { value: "admin", label: "Administrateur" },
  { value: "partner", label: "Partenaire" },
  { value: "viewer", label: "Lecteur" },
];

export default function Utilisateurs() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [users, setUsers] = useState([]);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "viewer",
    partner: "",
    status: "active",
    password: "",
  });
  const usersApi = api;

  const fetchUsers = async () => {
    try {
      const res = await usersApi.get("/users");
      setUsers(res.data);
    } catch (err) {
      console.error("Erreur chargement utilisateurs", err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const resetForm = () => {
    setForm({
      full_name: "",
      email: "",
      role: "viewer",
      partner: "",
      status: "active",
      password: "",
    });
    setEditing(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) {
        await usersApi.put(`/users/${editing}`, payload);
      } else {
        await usersApi.post("/users", payload);
      }

      fetchUsers();
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Erreur sauvegarde utilisateur", err);
    }
  };

  const handleEdit = (user) => {
    setForm({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      partner: user.partner || "",
      status: user.status,
      password: "",
    });
    setEditing(user.id);
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Désactiver cet utilisateur ?")) return;

    try {
      await usersApi.delete(`/users/${id}`);
      fetchUsers();
    } catch (err) {
      console.error("Erreur suppression utilisateur", err);
    }
  };

  const handleResetPassword = async (id) => {
    if (!confirm("Envoyer un lien de reinitialisation par email ?")) return;

    try {
      await usersApi.post(`/users/${id}/reset-password`);
      alert("Email de reinitialisation envoye.");
    } catch (err) {
      console.error("Erreur reinitialisation mot de passe", err);
      alert("Erreur lors de l'envoi.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Utilisateurs</h1>
          <p className="page-subtitle">
            Gestion des accès et des rôles
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
          Nouvel utilisateur
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card-solid w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">
              {editing ? "Modifier l’utilisateur" : "Nouvel utilisateur"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nom complet *</label>
                <input
                  required
                  className="input mt-1"
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Email *</label>
                <input
                  required
                  type="email"
                  className="input mt-1"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium">Rôle</label>
                <select
                  className="select mt-1"
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value })
                  }
                >
                  {roles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">
                  Partenaire (optionnel)
                </label>
                <input
                  className="input mt-1"
                  value={form.partner}
                  onChange={(e) =>
                    setForm({ ...form, partner: e.target.value })
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

              <div>
                <label className="text-sm font-medium">
                  Mot de passe (optionnel)
                </label>
                <input
                  type="password"
                  className="input mt-1"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
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
              <th className="text-left px-4 py-3">Utilisateur</th>
              <th className="text-left px-4 py-3">Rôle</th>
              <th className="text-left px-4 py-3">Partenaire</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="table-row">
                <td className="px-4 py-3">
                  <div className="font-medium flex items-center gap-2">
                    <User className="w-4 h-4 text-orange-500" />
                    {u.full_name}
                  </div>
                  <div className="flex items-center gap-1 text-slate-500 text-xs mt-1">
                    <Mail className="w-3 h-3" />
                    {u.email}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span className="flex items-center gap-1">
                    <Shield className="w-4 h-4" />
                    {roles.find((r) => r.value === u.role)?.label}
                  </span>
                </td>

                <td className="px-4 py-3">
                  {u.partner ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {u.partner}
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      u.status === "active"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {u.status}
                  </span>
                </td>

                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEdit(u)}
                    className="text-slate-500 hover:text-orange-500 mr-2"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleResetPassword(u.id)}
                    className="text-slate-500 hover:text-blue-500 mr-2"
                    title="Envoyer un lien de reinitialisation"
                  >
                    <Shield className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="text-slate-500 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

