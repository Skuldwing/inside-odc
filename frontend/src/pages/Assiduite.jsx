import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Phone,
  Search,
  TrendingUp,
  Users,
  AlertTriangle,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { EmptyState, StatTile } from "../components/ui";

/**
 * Assiduité : qui revient, et à quoi.
 *
 * La liste des participants répond à « qui est venu ? ». Elle ne répond pas à
 * « qui revient ? » — or c'est cette question qui dit si un parcours se
 * construit, et qui repérer pour la suite.
 *
 * C'est la même matière, vue par personne plutôt que par ligne de présence :
 * elle vit donc dans la page Participants, en second onglet, plutôt que dans
 * une entrée de menu séparée qu'il fallait penser à ouvrir.
 *
 * Une personne qui suit trois formations figure sur trois listes de présence,
 * remplies à trois moments différents : elle peut donc avoir trois fiches. Le
 * rapprochement se fait sur ce qu'elle a communiqué — adresse, téléphone, nom
 * — et le détail de cette règle vit côté serveur, où il est éprouvé à part.
 */

function formatDate(v) {
  if (!v) return "";
  try {
    return format(parseISO(String(v)), "d MMM yyyy", { locale: fr });
  } catch {
    return String(v).slice(0, 10);
  }
}

const normaliser = (v) =>
  String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Assiduite() {
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");
  const [ouverte, setOuverte] = useState(null);
  const [minModules, setMinModules] = useState(1);
  /* Pagination. Une base de plusieurs centaines de personnes tenait sur une
     seule page interminable : on n'y retrouvait rien, et le classement perdait
     son sens passé le premier écran. */
  const [page, setPage] = useState(1);
  const [parPage, setParPage] = useState(25);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur("");
    try {
      const res = await api.get("/participants/assiduite");
      setData(res.data);
    } catch (err) {
      setErreur(err?.response?.data?.error || "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const filtres = useMemo(() => {
    const q = normaliser(recherche.trim());
    return (data?.classement || []).filter((x) => {
      if (x.total_modules < minModules) return false;
      if (!q) return true;
      return (
        normaliser(`${x.prenom} ${x.nom}`).includes(q) ||
        normaliser(x.email).includes(q) ||
        String(x.telephone || "").replace(/\s+/g, "").includes(q.replace(/\s+/g, "")) ||
        x.modules.some((m) => normaliser(m.titre).includes(q))
      );
    });
  }, [data, recherche, minModules]);

  /* Le classement est rangé du plus assidu au moins assidu : le rang d'une
     personne se lit sur la liste entière, jamais sur la page affichée. */
  const rangs = useMemo(() => {
    const m = new Map();
    (data?.classement || []).forEach((x, i) => m.set(x.cle, i + 1));
    return m;
  }, [data]);

  const pages = Math.max(1, Math.ceil(filtres.length / parPage));
  const pageSure = Math.min(page, pages);
  const visibles = filtres.slice((pageSure - 1) * parPage, pageSure * parPage);

  /* Changer de filtre remet au début : rester page 4 d'une liste qui n'en a
     plus que deux afficherait un vide inexplicable. */
  useEffect(() => { setPage(1); }, [recherche, minModules, parPage]);

  if (chargement) {
    return (
      <div className="card-solid flex items-center gap-2 p-6 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Rapprochement des fiches…
      </div>
    );
  }

  if (erreur) {
    return (
      <EmptyState icon={AlertTriangle} title="Assiduité indisponible" description={erreur}
        actionLabel="Réessayer" onAction={charger} />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Qui revient, et à quels modules. Une personne inscrite sous plusieurs fiches est
        reconnue par son adresse, son téléphone ou son nom.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Personnes distinctes" value={data?.personnes ?? 0} icon={Users} />
        <StatTile
          label="Revenues au moins deux fois"
          value={data?.fideles ?? 0}
          icon={TrendingUp}
          tone="success"
          hint={
            data?.personnes
              ? `${Math.round(((data.fideles || 0) / data.personnes) * 100)} % des bénéficiaires`
              : undefined
          }
        />
        {/* Deux personnes peuvent porter le même nom. Celles-là sont restées
            séparées : le dire évite de prendre un comptage juste pour une
            erreur, et permet d'aller vérifier. */}
        <StatTile
          label="Homonymes à vérifier"
          value={data?.homonymes ?? 0}
          icon={AlertTriangle}
          tone={data?.homonymes ? "warning" : "neutral"}
          hint="Même nom, coordonnées différentes"
        />
      </div>

      <section className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom, adresse, téléphone ou module…"
              className="input w-full pl-9"
            />
          </div>
          <select
            value={minModules}
            onChange={(e) => setMinModules(Number(e.target.value))}
            className="select sm:w-52"
          >
            <option value={1}>Tout le monde</option>
            <option value={2}>2 modules et plus</option>
            <option value={3}>3 modules et plus</option>
            <option value={5}>5 modules et plus</option>
          </select>
          <select
            value={parPage}
            onChange={(e) => setParPage(Number(e.target.value))}
            className="select sm:w-40"
            aria-label="Nombre de personnes par page"
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>{n} par page</option>
            ))}
          </select>
        </div>
      </section>

      {filtres.length === 0 ? (
        <EmptyState
          icon={Award}
          title="Personne ne correspond"
          description={
            data?.personnes
              ? "Aucun bénéficiaire ne correspond à cette recherche ou à ce seuil."
              : "Les parcours se construisent à partir des listes de présence. Importez-en une dans une activité."
          }
        />
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden p-0">
          {visibles.map((x) => {
            const depliee = ouverte === x.cle;
            return (
              <li key={x.cle}>
                <button
                  type="button"
                  onClick={() => setOuverte(depliee ? null : x.cle)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  {/* Le rang se lit sur la liste entière, pas sur le filtre :
                      un classement qui se renumérote à chaque recherche ne
                      veut plus rien dire. */}
                  <span className="w-8 flex-shrink-0 text-center text-sm font-semibold tabular-nums text-slate-400">
                    {rangs.get(x.cle)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium text-slate-800">
                        {x.prenom} {x.nom}
                      </span>
                      {x.homonymes && (
                        <span
                          className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                          title="Une autre personne porte le même nom, avec des coordonnées différentes. Les deux sont comptées séparément."
                        >
                          homonyme
                        </span>
                      )}
                      {x.fiches.length > 1 && (
                        <span className="text-[11px] text-slate-400">
                          {x.fiches.length} fiches réunies
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {x.email && (
                        <span className="inline-flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                          {x.email}
                        </span>
                      )}
                      {x.telephone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                          {x.telephone}
                        </span>
                      )}
                      {x.structure && <span className="truncate">{x.structure}</span>}
                    </span>
                  </span>

                  <span
                    className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      x.total_modules > 1
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {x.total_modules} module{x.total_modules > 1 ? "s" : ""}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${depliee ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>

                {depliee && (
                  <ul className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
                    {x.modules.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-baseline gap-x-2 py-1 text-xs">
                        <span className="font-medium text-slate-700">{m.titre}</span>
                        {m.date && <span className="text-slate-500">{formatDate(m.date)}</span>}
                        {m.dispositif && (
                          <span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-500">
                            {m.dispositif}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {filtres.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {filtres.length === data?.personnes
              ? `${filtres.length} personne${filtres.length > 1 ? "s" : ""}`
              : `${filtres.length} personne${filtres.length > 1 ? "s" : ""} sur ${data?.personnes ?? 0}`}
            {pages > 1 && ` · page ${pageSure} / ${pages}`}
          </p>

          {pages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((n) => Math.max(1, n - 1))}
                disabled={pageSure <= 1}
                className="btn-ghost border text-xs disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Précédent
              </button>
              <button
                type="button"
                onClick={() => setPage((n) => Math.min(pages, n + 1))}
                disabled={pageSure >= pages}
                className="btn-ghost border text-xs disabled:opacity-40"
              >
                Suivant <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
