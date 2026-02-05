import { useEffect, useState } from "react";
import { Users, Search, Download } from "lucide-react";
import api from "../api";
import { useAuth } from "../auth/useAuth";

export default function Participants() {
  const { isViewer } = useAuth();

  const [participants, setParticipants] = useState([]);
  const [search, setSearch] = useState("");

  const fetchParticipants = async () => {
    try {
      const res = await api.get("/participants");
      setParticipants(res.data);
    } catch (err) {
      console.error("Erreur chargement participants", err);
    }
  };

  useEffect(() => {
    fetchParticipants();
  }, []);

  const filtered = participants.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.nom?.toLowerCase().includes(q) ||
      p.prenom?.toLowerCase().includes(q) ||
      p.activite?.toLowerCase().includes(q) ||
      p.partenaire?.toLowerCase().includes(q)
    );
  });

  const exportExcel = () => {
    const headers = [
      "Nom",
      "Prenom",
      "Genre",
      "Email",
      "Telephone",
      "Statut",
      "Activite",
      "Date activite",
      "Partenaire",
      "Dispositif",
    ];

    const rows = filtered.map((p) => [
      p.nom,
      p.prenom,
      p.genre,
      p.email,
      p.telephone,
      p.statut,
      p.activite,
      p.date_activite,
      p.partenaire,
      p.dispositif,
    ]);

    const csv = [headers, ...rows].map((r) => r.join(";")).join("\n");

    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "participants_odc.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="page-title">Participants / Bénéficiaires</h1>
          <p className="page-subtitle">
            Base consolidée issue des activités
          </p>
        </div>

        {!isViewer && (
          <button
            onClick={exportExcel}
            className="btn-primary"
          >
            <Download className="w-4 h-4" />
            Exporter Excel
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, activité, partenaire..."
            className="input pl-10"
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead className="table-head">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Prénom</th>
              <th className="p-3">Genre</th>
              <th className="p-3">Email</th>
              <th className="p-3">Téléphone</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Activité</th>
              <th className="p-3">Date</th>
              <th className="p-3">Partenaire</th>
              <th className="p-3">Dispositif</th>
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="text-center p-8 text-slate-500"
                >
                  <Users className="mx-auto mb-2 text-slate-300" />
                  Aucun participant trouvé
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="p-3 font-medium">{p.nom}</td>
                  <td className="p-3">{p.prenom}</td>
                  <td className="p-3">
                    <span
                      className={`badge ${
                        p.genre === "H"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-pink-100 text-pink-700"
                      }`}
                    >
                      {p.genre}
                    </span>
                  </td>
                  <td className="p-3">{p.email}</td>
                  <td className="p-3">{p.telephone}</td>
                  <td className="p-3">{p.statut}</td>
                  <td className="p-3">{p.activite}</td>
                  <td className="p-3">{p.date_activite}</td>
                  <td className="p-3">{p.partenaire}</td>
                  <td className="p-3">{p.dispositif}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
