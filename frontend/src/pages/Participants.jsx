import { useEffect, useCallback, useState, useRef } from "react";
import { Users, Search, Download, Filter, UserRound, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Check } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { EmptyState, DensityToggle, useDensity, useToast } from "../components/ui";
import { useAuth } from "../auth/useAuth";

/* La date arrivait telle que la rend pg — « 2026-09-08T00:00:00.000Z » —
   c'est-a-dire un horodatage brut, illisible dans un tableau. */
function formatDate(value) {
  if (!value) return "-";
  try {
    return format(parseISO(String(value)), "d MMM yyyy", { locale: fr });
  } catch {
    return String(value).slice(0, 10);
  }
}

export default function Participants() {
  const { isCompact } = useDensity();
  const { isViewer } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [searchParams] = useSearchParams();

  const [search, setSearch]           = useState(searchParams.get("q") || "");
  const [genderFilter, setGenderFilter] = useState("");
  const [page, setPage]               = useState(1);

  const [rows, setRows]               = useState([]);
  const [total, setTotal]             = useState(0);
  const [stats, setStats]             = useState({ male: 0, female: 0 });
  const [pages, setPages]             = useState(1);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  /* Noms de famille écrits deux fois, hérités des imports passés : « Rockaya
     Samb » en prénom et « Samb » en nom, que l'attestation imprimerait tel
     quel. Le panneau ne s'affiche que s'il y a effectivement quelque chose à
     corriger. */
  const [doublons, setDoublons] = useState(null);
  const [doublonsOuverts, setDoublonsOuverts] = useState(false);
  const [correction, setCorrection] = useState(false);

  const chercherDoublons = useCallback(async () => {
    try {
      const res = await api.get("/participants/doublons-nom");
      setDoublons(res.data);
    } catch {
      setDoublons(null);   /* silencieux : c'est un bonus, pas la page */
    }
  }, []);

  const corrigerDoublons = async () => {
    if (!doublons?.participants?.length) return;
    setCorrection(true);
    try {
      const res = await api.post("/participants/doublons-nom/corriger", {
        ids: doublons.participants.map((p) => p.id),
      });
      toast.success(`${res.data.corriges} nom${res.data.corriges > 1 ? "s" : ""} corrigé${res.data.corriges > 1 ? "s" : ""}.`);
      setDoublonsOuverts(false);
      await chercherDoublons();
      fetchPage(debouncedSearch.current, genderFilter, page);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La correction a échoué.");
    } finally {
      setCorrection(false);
    }
  };

  /* Fiches en double laissées par l'ancien import : la même personne inscrite
     deux fois, dont une fois sans coordonnées. La fusion supprime la fiche
     vide après lui avoir repris ses présences — irréversible, donc jamais
     automatique et toujours consultable avant. */
  const [fiches, setFiches] = useState(null);
  const [fichesOuvertes, setFichesOuvertes] = useState(false);
  const [fusion, setFusion] = useState(false);

  const chercherFiches = useCallback(async () => {
    try {
      const res = await api.get("/participants/fiches-doublons");
      setFiches(res.data);
    } catch {
      setFiches(null);
    }
  }, []);

  const fusionnerFiches = async () => {
    const ids = (fiches?.groupes || []).flatMap((g) => g.absorber.map((f) => f.id));
    if (!ids.length) return;
    setFusion(true);
    try {
      const res = await api.post("/participants/fiches-doublons/fusionner", { ids });
      toast.success(`${res.data.fusionnees} fiche${res.data.fusionnees > 1 ? "s" : ""} fusionnée${res.data.fusionnees > 1 ? "s" : ""}.`);
      setFichesOuvertes(false);
      await chercherFiches();
      fetchPage(debouncedSearch.current, genderFilter, page);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La fusion a échoué.");
    } finally {
      setFusion(false);
    }
  };

  /* Debounce search → réinitialise la page */
  const debounceRef = useRef(null);
  const debouncedSearch = useRef(search);

  const fetchPage = useCallback(async (searchVal, genreVal, pageVal) => {
    setLoading(true);
    setError("");
    try {
      const params = { page: pageVal };
      if (searchVal) params.search = searchVal;
      if (genreVal)  params.genre  = genreVal;
      const res = await api.get("/participants", { params });
      const d   = res.data;
      setRows(d.rows || []);
      setTotal(d.total || 0);
      setPages(d.pages || 1);
      setStats({ male: d.male || 0, female: d.female || 0 });
    } catch {
      setError("Erreur de chargement des participants.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* Chargement initial */
  useEffect(() => {
    fetchPage(search, genderFilter, page);
    chercherDoublons();
    chercherFiches();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Filtre genre → reset page 1 */
  const handleGenre = (val) => {
    setGenderFilter(val);
    setPage(1);
    fetchPage(debouncedSearch.current, val, 1);
  };

  /* Recherche avec debounce 350ms → reset page 1 */
  const handleSearch = (val) => {
    setSearch(val);
    debouncedSearch.current = val;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPage(val, genderFilter, 1);
    }, 350);
  };

  /* Changement de page */
  const goToPage = (p) => {
    setPage(p);
    fetchPage(debouncedSearch.current, genderFilter, p);
  };

  /* Export CSV.
     Il etait construit a partir de `rows`, c'est-a-dire la seule page
     affichee : au-dela de 100 lignes le fichier etait silencieusement
     incomplet. Le serveur le produit desormais sur l'ensemble des lignes
     correspondant aux filtres en cours. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = {};
      if (debouncedSearch.current) params.search = debouncedSearch.current;
      if (genderFilter) params.genre = genderFilter;

      const res = await api.get("/participants/export.csv", {
        params,
        responseType: "blob",
      });

      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        res.headers["content-disposition"]?.match(/filename="([^"]+)"/)?.[1] ||
        "participants-odc.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      /* Liberation differee : Safari annule le telechargement si l'URL est
         revoquee trop tot. */
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      const count = res.headers["x-total-count"];
      toast.success(
        count
          ? `${Number(count).toLocaleString("fr-FR")} participant(s) exporté(s).`
          : "Export terminé."
      );
    } catch (err) {
      console.error("Erreur export participants", err);
      toast.error("L'export n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Répétitions héritées des imports passés. Le bandeau ne paraît que
          s'il y a quelque chose à corriger, et la liste est consultable avant
          d'agir : une correction en masse sur des identités ne se fait pas à
          l'aveugle. */}
      {doublons?.total > 0 && (
        <section className="card-solid overflow-hidden border border-amber-300">
          <button
            type="button"
            onClick={() => setDoublonsOuverts((o) => !o)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">
                {doublons.total} nom{doublons.total > 1 ? "s" : ""} de famille écrit
                {doublons.total > 1 ? "s" : ""} deux fois
              </span>
              <span className="block text-xs text-slate-500">
                Le nom a été recopié dans la colonne « Prénom » lors d&apos;un import. Les
                attestations l&apos;imprimeraient ainsi.
              </span>
            </span>
            <span className="text-xs text-slate-500">{doublonsOuverts ? "Masquer" : "Voir la liste"}</span>
          </button>

          {doublonsOuverts && (
            <div className="border-t border-amber-200">
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {doublons.participants.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-slate-500 line-through">
                      {p.prenom} {p.nom}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                      {p.prenom_corrige} {p.nom}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Seul le prénom change ; le nom et l&apos;adresse sont laissés tels quels. Chaque
                  correction est enregistrée dans le journal d&apos;audit.
                </p>
                <button
                  type="button"
                  onClick={corrigerDoublons}
                  disabled={correction}
                  className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {correction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {correction ? "Correction…" : `Corriger les ${doublons.total}`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Fiches en double. L'ancien import rapprochait les noms par égalité
          stricte : une variation d'écriture lui faisait créer une seconde
          fiche, forcément sans adresse puisque l'adresse était déjà prise. Il
          ne les fabrique plus ; celles qui existent restent à fusionner. */}
      {fiches?.total > 0 && (
        <section className="card-solid overflow-hidden border border-sky-300">
          <button
            type="button"
            onClick={() => setFichesOuvertes((o) => !o)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-sky-600" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">
                {fiches.total} fiche{fiches.total > 1 ? "s" : ""} en double, sans coordonnées
              </span>
              <span className="block text-xs text-slate-500">
                La même personne inscrite deux fois par un ancien import. La fiche vide
                n&apos;a ni adresse ni téléphone : elle ne reçoit rien.
              </span>
            </span>
            <span className="text-xs text-slate-500">{fichesOuvertes ? "Masquer" : "Voir la liste"}</span>
          </button>

          {fichesOuvertes && (
            <div className="border-t border-sky-200">
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {fiches.groupes.map((g) => (
                  <li key={g.garder.id} className="px-4 py-2 text-xs">
                    <p className="font-medium text-slate-800">
                      {g.garder.prenom} {g.garder.nom}
                      <span className="ml-1.5 font-normal text-slate-500">
                        {g.garder.email || g.garder.telephone} — fiche conservée
                      </span>
                    </p>
                    {g.absorber.map((f) => (
                      <p key={f.id} className="text-slate-500 line-through">
                        {f.prenom} {f.nom} — fiche supprimée
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Les présences de la fiche supprimée passent sur celle qui est conservée : aucune
                  activité n&apos;est perdue. L&apos;opération est définitive et consignée dans le
                  journal d&apos;audit.
                </p>
                <button
                  type="button"
                  onClick={fusionnerFiches}
                  disabled={fusion}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {fusion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {fusion ? "Fusion…" : `Fusionner les ${fiches.total}`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="surface-glass p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Base unifiée</p>
            <h1 className="mt-1 text-2xl lg:text-3xl font-semibold text-slate-900">
              Participants / Bénéficiaires
            </h1>
            <p className="mt-1 text-sm text-slate-500">Suivi complet des profils issus des activités.</p>
          </div>
          {!isViewer && (
            <button onClick={exportCsv} className="btn-primary" disabled={exporting || total === 0}>
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="w-4 h-4" aria-hidden="true" />
              )}
              {exporting
                ? "Export en cours…"
                : `Exporter CSV${total ? ` (${total.toLocaleString("fr-FR")})` : ""}`}
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total filtrés"  value={total} />
        <StatCard label="Hommes"         value={stats.male} />
        <StatCard label="Femmes"         value={stats.female} />
      </section>

      <section className="card p-4 lg:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-slate-700">
          <Filter className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Recherche et filtres</h2>
          <DensityToggle className="ml-auto" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Rechercher nom, activité, partenaire..."
              className="input pl-10"
            />
          </div>
          <select className="select" value={genderFilter} onChange={(e) => handleGenre(e.target.value)}>
            <option value="">Tous les genres</option>
            <option value="H">Hommes</option>
            <option value="F">Femmes</option>
          </select>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3">{error}</div>
      )}

      <section className="card overflow-x-auto">
        <table className="table">
          <thead className="table-head">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Prénom</th>
              <th className="p-3">Structure/Etablissement</th>
              <th className="p-3">Genre</th>
              <th className="p-3">Tranche d'âge</th>
              <th className="p-3">Email</th>
              <th className="p-3">Telephone</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Activité</th>
              <th className="p-3">Date</th>
              <th className="p-3">Partenaire</th>
              <th className="p-3">Dispositif</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="text-center p-8 text-slate-500">Chargement...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={12}>
                  <EmptyState
                    bare
                    icon={Users}
                    title="Aucun participant trouvé"
                    description="Les participants apparaissent ici dès qu'une liste de présences est importée sur une activité."
                  />
                </td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={`${p.id}_${p.activity_id ?? i}`} className="table-row">
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"} font-medium`}>{p.nom || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.prenom || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.structure || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>
                    <span className={`badge ${
                      p.genre === "H"
                        ? "bg-blue-100 border-blue-200 text-blue-700"
                        : "bg-pink-100 border-pink-200 text-pink-700"
                    }`}>
                      {p.genre || "-"}
                    </span>
                  </td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.age_range || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.email || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.telephone || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.statut || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.activite || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{formatDate(p.date_activite)}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.partenaire || "-"}</td>
                  <td className={`${isCompact ? "px-3 py-1.5" : "p-3"}`}>{p.dispositif || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Page {page} / {pages} — {total} résultat{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
                let p;
                if (pages <= 7) {
                  p = i + 1;
                } else if (page <= 4) {
                  p = i + 1;
                } else if (page >= pages - 3) {
                  p = pages - 6 + i;
                } else {
                  p = page - 3 + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => goToPage(p)}
                    disabled={loading}
                    className={`min-w-[32px] h-8 rounded-lg text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-orange-500 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= pages || loading}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <UserRound className="h-4 w-4 text-orange-500" />
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
