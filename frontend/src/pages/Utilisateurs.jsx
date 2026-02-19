import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  User,
  Mail,
  Shield,
  Building2,
  Link2,
  Pencil,
  Trash2,
  Search,
  UsersRound,
} from "lucide-react";
import api from "../api";
import AdminPinGate from "../components/AdminPinGate";

const roles = [
  { value: "admin", label: "Administrateur" },
  { value: "partner", label: "Partenaire" },
  { value: "viewer", label: "Lecteur" },
];

export default function Utilisateurs() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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
      setUsers(res.data || []);
    } catch (err) {
      console.error("Erreur chargement utilisateurs", err);
      setUsers([]);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.partner || "").toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: filteredUsers.length,
      active: filteredUsers.filter((u) => u.status === "active").length,
      inactive: filteredUsers.filter((u) => u.status !== "active").length,
    };
  }, [filteredUsers]);

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
    if (!confirm("Supprimer definitivement cet utilisateur ?")) return;
    try {
      await usersApi.delete(`/users/${id}/hard-delete`);
      fetchUsers();
    } catch (err) {
      console.error("Erreur suppression utilisateur", err);
    }
  };

  const handleCopyResetLink = async (id) => {
    try {
      const res = await usersApi.post(`/users/${id}/reset-link`);
      const link = res?.data?.link;
      if (!link) {
        alert("Lien indisponible.");
        return;
      }
      await navigator.clipboard.writeText(link);
      alert("Lien copie dans le presse-papiers.");
    } catch (err) {
      console.error("Erreur generation lien", err);
      alert("Erreur lors de la generation du lien.");
    }
  };

  return (
    <AdminPinGate>
      <div className="space-y-6">
        <section className="surface-glass p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                Administration
              </p>
              <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
                Utilisateurs
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Gestion des acces, roles et statuts.
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
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniStat label="Total filtres" value={stats.total} />
          <MiniStat label="Actifs" value={stats.active} />
          <MiniStat label="Inactifs" value={stats.inactive} />
        </section>

        <section className="card p-4 lg:p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher nom, email, partenaire..."
                className="input pl-10"
              />
            </div>
            <select
              className="select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">Tous les roles</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>
        </section>

        {open && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className="card-solid w-full max-w-lg p-6">
              <h2 className="text-xl font-semibold mb-4">
                {editing ? "Modifier utilisateur" : "Nouvel utilisateur"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Nom complet *</label>
                  <input
                    required
                    className="input mt-1"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Email *</label>
                  <input
                    required
                    type="email"
                    className="input mt-1"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Role</label>
                  <select
                    className="select mt-1"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                  >
                    {roles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Partenaire (optionnel)</label>
                  <input
                    className="input mt-1"
                    value={form.partner}
                    onChange={(e) => setForm({ ...form, partner: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Statut</label>
                  <select
                    className="select mt-1"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium">Mot de passe (optionnel)</label>
                  <input
                    type="password"
                    className="input mt-1"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setOpen(false)} className="btn-ghost border">
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

        <section className="card overflow-x-auto">
          <table className="table">
            <thead className="table-head">
              <tr>
                <th className="text-left px-4 py-3">Utilisateur</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Partenaire</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Aucun utilisateur trouve.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
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
                      <span className="inline-flex items-center gap-1">
                        <Shield className="w-4 h-4" />
                        {roles.find((r) => r.value === u.role)?.label || u.role}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {u.partner ? (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {u.partner}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`badge ${
                          u.status === "active"
                            ? "bg-green-100 border-green-200 text-green-700"
                            : "bg-slate-100 border-slate-200 text-slate-700"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleEdit(u)}
                        className="text-slate-500 hover:text-orange-500 mr-2"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCopyResetLink(u.id)}
                        className="text-slate-500 hover:text-indigo-500 mr-2"
                        title="Copier le lien de reinitialisation"
                      >
                        <Link2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-slate-500 hover:text-red-500"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </AdminPinGate>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-orange-500" />
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
