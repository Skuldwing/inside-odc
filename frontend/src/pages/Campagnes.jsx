import { useEffect, useState } from "react";
import {
  Plus,
  Mail,
  MessageSquare,
  Calendar,
  ShieldAlert,
} from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";

export default function Campagnes() {
  const { isAdmin } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [campagnes, setCampagnes] = useState([]);

  const [form, setForm] = useState({
    name: "",
    type: "email",
    message: "",
  });

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <ShieldAlert
            className="mx-auto mb-4 text-orange-500"
            size={40}
          />
          <h2 className="text-xl font-semibold mb-2">Accès restreint</h2>
          <p className="text-slate-500">
            Cette page est réservée aux administrateurs.
          </p>
        </div>
      </div>
    );
  }

  const fetchCampagnes = async () => {
    try {
      const res = await api.get("/campagnes");
      setCampagnes(res.data);
    } catch (err) {
      console.error("Erreur chargement campagnes", err);
    }
  };

  useEffect(() => {
    fetchCampagnes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post("/campagnes", form);
      fetchCampagnes();
      setForm({ name: "", type: "email", message: "" });
      setIsOpen(false);
    } catch (err) {
      console.error("Erreur création campagne", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Campagnes</h1>
          <p className="page-subtitle">
            Campagnes de communication (Email / SMS)
          </p>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Nouvelle campagne
        </button>
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="card-solid w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Nouvelle campagne</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">
                  Nom de la campagne
                </label>
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
                <label className="text-sm font-medium">Type de campagne</label>
                <select
                  className="select mt-1"
                  value={form.type}
                  onChange={(e) =>
                    setForm({ ...form, type: e.target.value })
                  }
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Message</label>
                <textarea
                  required
                  rows="4"
                  className="input mt-1"
                  value={form.message}
                  onChange={(e) =>
                    setForm({ ...form, message: e.target.value })
                  }
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn-ghost border"
                >
                  Annuler
                </button>
                <button type="submit" className="btn-primary">
                  Créer
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
              <th className="text-left px-4 py-3">Campagne</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Message</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody>
            {campagnes.map((c) => (
              <tr key={c.id} className="table-row">
                <td className="px-4 py-3 font-medium">{c.name}</td>

                <td className="px-4 py-3">
                  {c.type === "email" ? (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Mail className="w-4 h-4" /> Email
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-green-600">
                      <MessageSquare className="w-4 h-4" /> SMS
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 text-slate-600 truncate max-w-xs">
                  {c.message}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {c.created_at || c.date}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`badge ${
                      c.status === "envoyee"
                        ? "bg-green-100 text-green-700"
                        : c.status === "programmee"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
