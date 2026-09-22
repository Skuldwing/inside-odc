import { useEffect, useCallback, useState, useRef } from "react";
import { Users, Search, Download, Filter, UserRound, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Check, TrendingUp, List } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { EmptyState, DensityToggle, useDensity, useToast } from "../components/ui";
import { useAuth } from "../auth/useAuth";
import Assiduite from "./Assiduite";

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

/* Les colonnes du tableau d'un groupe, dans l'ordre où on les lit sur une
   liste de présence. */
const CHAMPS_FICHE = [
  ["email", "Email"],
  ["telephone", "Téléphone"],
  ["genre", "Genre"],
  ["age_range", "Tranche d'âge"],
  ["statut", "Statut"],
  ["structure", "Structure"],
];

const vide = (v) => v === null || v === undefined || String(v).trim() === "";
const normaliser = (champ, v) =>
  vide(v) ? null : champ === "telephone" ? String(v).replace(/\s+/g, "") : String(v).trim().toLowerCase();

/**
 * Un groupe de fiches, montré tel qu'il est plutôt que résumé.
 *
 * Le panneau disait « gagne email « x » » et « genre : garde « F », écarte
 * « M » ». C'était juste, mais illisible : pour décider si deux fiches sont
 * bien la même personne, il faut voir les fiches, pas une phrase à leur sujet.
 *
 * Une ligne par fiche, une colonne par renseignement, et seulement les
 * colonnes où quelque chose est écrit — afficher six colonnes vides pour un
 * groupe qui ne porte qu'une adresse noierait la seule information utile.
 *
 * Les formations sont la preuve qui permet de trancher : deux fiches sur deux
 * formations différentes, c'est une personne revenue ; deux fiches sur la même
 * formation, c'est un doublon d'import ou deux homonymes.
 */
function GroupeFiches({ groupe: g, ecarte, onBasculer }) {
  const membres = [g.garder, ...g.absorber];

  /* On ne garde que les colonnes renseignées quelque part dans le groupe. */
  const colonnes = CHAMPS_FICHE.filter(([champ]) =>
    membres.some((f) => !vide(f[champ]))
  );

  /* La valeur qui remplira les cases vides : la seule que le groupe connaisse.
     Si deux fiches portent des valeurs différentes, on ne tranche pas — chacune
     garde la sienne. Un désaccord se regarde, il ne se résout pas par une
     règle. */
  const valeurRetenue = (champ) => {
    const connues = new Map();
    for (const f of membres) {
      const n = normaliser(champ, f[champ]);
      if (n !== null && !connues.has(n)) connues.set(n, String(f[champ]).trim());
    }
    return connues.size === 1 ? [...connues.values()][0] : null;
  };

  /* Cette case va se remplir : elle est vide et le groupe connaît la valeur. */
  const seraRemplie = (champ, valeur) => vide(valeur) && valeurRetenue(champ) !== null;

  const activites = (f) =>
    (f.activites || []).map((a) => a.titre + (a.date ? ` (${formatDate(a.date)})` : "")).join(" · ");

  return (
    <li className={`px-4 py-3 ${ecarte ? "opacity-50" : ""}`}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={!ecarte}
          onChange={onBasculer}
          className="mt-1 h-3.5 w-3.5 flex-shrink-0 accent-sky-600"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-slate-800">
              {g.garder.prenom} {g.garder.nom}
            </span>
            <span className="text-xs text-slate-500">
              {membres.length} fiches — conservées toutes les deux
            </span>
            {/* L'alerte la plus utile du panneau : elle désigne précisément
                les lignes où le rapprochement par le nom peut se tromper. */}
            {g.activite_partagee && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                deux fiches sur la même formation — homonymes ?
              </span>
            )}
            {g.conflits.length > 0 && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                {g.conflits.length} désaccord{g.conflits.length > 1 ? "s" : ""}
              </span>
            )}
          </span>

          {colonnes.length > 0 ? (
            <span className="mt-2 block overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pb-1 pr-3 font-medium">Fiche</th>
                    {colonnes.map(([champ, libelle]) => (
                      <th key={champ} className="pb-1 pr-3 font-medium">{libelle}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="align-top">
                  {membres.map((f, i) => (
                    <tr key={f.id} className="border-t border-slate-100">
                      <td className="py-1 pr-3 whitespace-nowrap text-slate-500">
                        fiche {i + 1}
                      </td>
                      {colonnes.map(([champ]) => (
                        <td key={champ} className="py-1 pr-3 break-all">
                          {/* Rien n'est barré : aucune valeur ne disparaît.
                              Ce qui est vide et que le groupe connaît se
                              remplira — on le montre en vert, à sa place. */}
                          {vide(f[champ]) ? (
                            seraRemplie(champ, f[champ]) ? (
                              <span className="font-medium text-emerald-700">
                                + {valeurRetenue(champ)}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )
                          ) : (
                            <span className="text-slate-700">{String(f[champ]).trim()}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </span>
          ) : (
            <span className="mt-1 block text-xs text-slate-500">
              Ces fiches ne portent aucun renseignement : il n&apos;y a rien à compléter.
            </span>
          )}

          {/* Les formations de chaque fiche : c'est ce qui permet de dire si
              une même personne est revenue, ou si deux personnes se
              ressemblent. */}
          <span className="mt-2 block space-y-0.5 text-[11px] text-slate-500">
            {membres.map((f, i) => (
              <span key={f.id} className="block">
                <span className="text-slate-400">fiche {i + 1} :</span>{" "}
                {f.activites_total ? (
                  <>
                    {activites(f)}
                    {f.activites_total > (f.activites || []).length &&
                      ` · et ${f.activites_total - f.activites.length} autre(s)`}
                  </>
                ) : (
                  <span className="italic">aucune formation</span>
                )}
              </span>
            ))}
          </span>
        </span>
      </label>
    </li>
  );
}


/**
 * Fiches supprimées par l'ancienne réunion.
 *
 * Cette opération supprimait la fiche absorbée. Quand deux fiches d'une même
 * personne figuraient sur la même activité, son effectif perdait une unité —
 * et si le rapprochement était faux, un vrai bénéficiaire disparaissait d'une
 * liste de présence.
 *
 * Le journal d'audit avait conservé chaque fiche et ses inscriptions : elles
 * peuvent être remises en place. Rien n'est restauré d'office — certaines
 * réunions étaient justes, et recréer une vraie ligne en double regonflerait
 * un effectif à tort. On montre, l'utilisateur choisit.
 */
function FichesARestaurer() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [choisies, setChoisies] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const res = await api.get("/participants/fiches-absorbees");
      setData(res.data);
    } catch {
      setData(null);   /* silencieux : c'est une réparation, pas la page */
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const aRestaurer = (data?.lignes || []).filter((l) => !l.restauree);
  if (!aRestaurer.length) return null;

  const basculer = (j) =>
    setChoisies((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(j)) suivant.delete(j); else suivant.add(j);
      return suivant;
    });

  const restaurer = async () => {
    if (!choisies.size) return;
    setEnCours(true);
    try {
      const res = await api.post("/participants/fiches-absorbees/restaurer", {
        journaux: [...choisies],
      });
      toast.success(
        `${res.data.restaurees} fiche${res.data.restaurees > 1 ? "s" : ""} remise${res.data.restaurees > 1 ? "s" : ""} en place, ` +
        `${res.data.inscriptions} inscription${res.data.inscriptions > 1 ? "s" : ""} rétablie${res.data.inscriptions > 1 ? "s" : ""}.`
      );
      setChoisies(new Set());
      await charger();
    } catch (err) {
      toast.error(err?.response?.data?.error || "La restauration a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="card-solid overflow-hidden border border-red-300">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {aRestaurer.length} fiche{aRestaurer.length > 1 ? "s" : ""} supprimée
            {aRestaurer.length > 1 ? "s" : ""} par une ancienne réunion
          </span>
          <span className="block text-xs text-slate-500">
            Cette opération supprimait la fiche absorbée : l&apos;effectif de certaines activités
            a pu baisser. Elles peuvent être remises en place.
          </span>
        </span>
        <span className="text-xs text-slate-500">{ouvert ? "Masquer" : "Voir la liste"}</span>
      </button>

      {ouvert && (
        <div className="border-t border-red-200">
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {aRestaurer.map((l) => (
              <li key={l.journal} className="px-4 py-2.5 text-xs">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={choisies.has(l.journal)}
                    onChange={() => basculer(l.journal)}
                    className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-red-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-800">
                      {l.fiche.prenom} {l.fiche.nom}
                      <span className="ml-2 font-normal text-slate-400">
                        supprimée le {new Date(l.supprimee_le).toLocaleDateString("fr-FR")}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-slate-500">
                      {[l.fiche.email, l.fiche.telephone, l.fiche.structure]
                        .filter(Boolean).join(" · ") || "aucune coordonnée"}
                    </span>
                    {/* Ce qui décide : les listes de présence où sa ligne
                        manque aujourd'hui. */}
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {l.activites.length === 0
                        ? "n'était inscrite à aucune activité"
                        : `inscrite à : ${l.activites.map((a) =>
                            a.existe ? `${a.titre}${a.date ? ` (${formatDate(a.date)})` : ""}`
                                     : `${a.titre} — supprimée depuis`).join(" · ")}`}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <p className="max-w-xl text-xs text-slate-500">
              La fiche est recréée avec ses inscriptions : les effectifs concernés remontent.
              Elle reçoit un nouvel identifiant — l&apos;ancien est perdu — mais les listes de
              présence retrouvent leur ligne.{" "}
              <strong className="text-slate-600">
                Ne restaurez que celles qui manquent vraiment
              </strong>{" "}
              : certaines réunions étaient justes, et remettre une ligne réellement en double
              regonflerait un effectif à tort.
            </p>
            <button
              type="button"
              onClick={restaurer}
              disabled={enCours || choisies.size === 0}
              className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {enCours ? "Restauration…" : `Remettre en place ${choisies.size} fiche${choisies.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Participants() {
  const { isCompact } = useDensity();
  const { isViewer } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [searchParams] = useSearchParams();

  /* L'onglet vit dans l'adresse : un lien vers l'assiduité doit l'ouvrir
     directement, et l'ancienne adresse /assiduite y renvoie. */
  const [vue, setVue] = useState(searchParams.get("vue") === "assiduite" ? "assiduite" : "liste");
  const [exportAssiduite, setExportAssiduite] = useState(false);

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

  /* Fiches de la même personne, éparpillées par les anciens imports. Chaque
     liste de présence portant des colonnes différentes, son information est
     répartie entre plusieurs fiches dont aucune n'est complète. Les réunir en
     une seule, qui reçoit tout et garde toutes les inscriptions — irréversible,
     donc jamais automatique et toujours consultable avant. */
  const [fiches, setFiches] = useState(null);
  const [fichesOuvertes, setFichesOuvertes] = useState(false);
  const [fusion, setFusion] = useState(false);
  /* Groupes volontairement écartés. Le rapprochement se fait sur le nom : deux
     personnes qui portent le même, et dont une seule a des coordonnées, sont
     indiscernables pour la machine. Sur des noms très répandus, c'est à
     l'utilisateur de trancher — d'où le décochage, un par un. */
  const [ecartes, setEcartes] = useState(() => new Set());

  const basculerGroupe = (id) =>
    setEcartes((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const groupesRetenus = (fiches?.groupes || []).filter((g) => !ecartes.has(g.garder.id));
  const idsRetenus = groupesRetenus.flatMap((g) => g.absorber.map((f) => f.id));

  const chercherFiches = useCallback(async () => {
    try {
      const res = await api.get("/participants/fiches-doublons");
      setFiches(res.data);
      /* Partent décochés : les groupes dont les fiches se contredisent — garder
         une adresse plutôt qu'une autre ne se décide pas tout seul — et ceux où
         deux fiches figurent sur la même formation, qui ne s'expliquent pas par
         une personne revenue et sont le cas le plus probable d'homonymes. */
      setEcartes(
        new Set(
          (res.data?.groupes || [])
            .filter((g) => g.conflits?.length > 0 || g.activite_partagee)
            .map((g) => g.garder.id)
        )
      );
    } catch {
      setFiches(null);
    }
  }, []);

  const completerFiches = async () => {
    const ids = idsRetenus;
    if (!ids.length) return;
    setFusion(true);
    try {
      const res = await api.post("/participants/fiches-doublons/completer", { ids });
      toast.success(
        res.data.champs_remplis
          ? `${res.data.champs_remplis} information${res.data.champs_remplis > 1 ? "s" : ""} complétée${res.data.champs_remplis > 1 ? "s" : ""} sur ${res.data.fiches_completees} fiche${res.data.fiches_completees > 1 ? "s" : ""}.`
          : "Rien à compléter : ces fiches portent déjà la même information."
      );
      setFichesOuvertes(false);
      await chercherFiches();
      fetchPage(debouncedSearch.current, genderFilter, page);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La complétion a échoué.");
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
  /* Le bouton d'export de l'en-tête suit l'onglet : sur « Assiduité », il
     produit le classement, pas la liste des lignes de présence. */
  const exportAssiduiteCsv = async () => {
    setExportAssiduite(true);
    try {
      const res = await api.get("/participants/assiduite/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `assiduite-odc-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error("L'export a échoué.");
    } finally {
      setExportAssiduite(false);
    }
  };

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

      <FichesARestaurer />

      {/* Une personne suit plusieurs formations et figure sur autant de listes,
          qui ne portent pas les mêmes colonnes. Les anciens imports créaient
          une fiche par liste au lieu de compléter la sienne : son information
          s'est retrouvée éparpillée entre plusieurs fiches dont aucune n'est
          complète. Ce panneau les réunit. */}
      {fiches?.personnes > 0 && (
        <section className="card-solid overflow-hidden border border-sky-300">
          <button
            type="button"
            onClick={() => setFichesOuvertes((o) => !o)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <AlertTriangle className="h-5 w-5 flex-shrink-0 text-sky-600" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">
                {fiches.personnes} personne{fiches.personnes > 1 ? "s ont" : " a"} plusieurs fiches
              </span>
              <span className="block text-xs text-slate-500">
                {fiches.a_completer > 0 && (
                  <>
                    {fiches.a_completer} fiche{fiches.a_completer > 1 ? "s" : ""} se
                    complèterai{fiches.a_completer > 1 ? "ent" : "t"} avec ce que portent les autres
                  </>
                )}
                {fiches.a_completer > 0 && fiches.a_regarder > 0 && " · "}
                {fiches.a_regarder > 0 && (
                  <span className="text-amber-700">
                    {fiches.a_regarder} à regarder, décochée{fiches.a_regarder > 1 ? "s" : ""} par précaution
                  </span>
                )}
              </span>
            </span>
            <span className="text-xs text-slate-500">{fichesOuvertes ? "Masquer" : "Voir la liste"}</span>
          </button>

          {fichesOuvertes && (
            <div className="border-t border-sky-200">
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {fiches.groupes.map((g) => (
                  <GroupeFiches
                    key={g.garder.id}
                    groupe={g}
                    ecarte={ecartes.has(g.garder.id)}
                    onBasculer={() => basculerGroupe(g.garder.id)}
                  />
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
                <p className="max-w-xl text-xs text-slate-500">
                  <strong className="text-slate-600">
                    Aucune fiche n&apos;est supprimée et aucune inscription n&apos;est déplacée.
                  </strong>{" "}
                  Les cases vides de chaque fiche se remplissent avec ce que les autres portent,
                  pour que l&apos;information soit complète sur toutes les listes de présence.
                  Les effectifs de vos activités ne peuvent pas bouger.
                  {" "}
                  {" "}Le rapprochement se fait sur le nom : il ne distingue pas deux homonymes.
                  Les lignes qui se contredisent, et celles où deux fiches figurent sur la même
                  formation, partent décochées.
                </p>
                <button
                  type="button"
                  onClick={completerFiches}
                  disabled={fusion || idsRetenus.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {fusion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {fusion ? "Complétion…" : `Compléter ${idsRetenus.length} fiche${idsRetenus.length > 1 ? "s" : ""}`}
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
            vue === "assiduite" ? (
              <button onClick={exportAssiduiteCsv} className="btn-primary" disabled={exportAssiduite}>
                {exportAssiduite ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="w-4 h-4" aria-hidden="true" />
                )}
                {exportAssiduite ? "Export en cours…" : "Exporter l'assiduité"}
              </button>
            ) : (
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
            )
          )}
        </div>

        {/* La même matière, vue par ligne de présence ou par personne. */}
        <div className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {[
            ["liste", "Liste", List],
            ["assiduite", "Assiduité", TrendingUp],
          ].map(([cle, libelle, Icone]) => (
            <button
              key={cle}
              type="button"
              onClick={() => setVue(cle)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                vue === cle ? "bg-orange-500 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icone className="h-3.5 w-3.5" aria-hidden="true" />
              {libelle}
            </button>
          ))}
        </div>
      </section>

      {vue === "assiduite" && <Assiduite />}

      {vue === "liste" && (
      <>
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
      </>
      )}
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
