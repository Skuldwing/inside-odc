import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award,
  ChevronDown,
  Download,
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
import { EmptyState, StatTile, useToast } from "../components/ui";

/**
 * Assiduité : qui revient, et à quoi.
 *
 * La liste des participants répond à « qui est venu ? ». Elle ne répond pas à
 * « qui revient ? » — or c'est cette question qui dit si un parcours se
 * construit, et qui repérer pour la suite.
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
  const toast = useToast();
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");
  const [ouverte, setOuverte] = useState(null);
  const [minModules, setMinModules] = useState(1);
  const [export_, setExport] = useState(false);

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

  const telecharger = async () => {
    setExport(true);
    try {
      const res = await api.get("/participants/assiduite/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `assiduite-odc-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("L'export a échoué.");
    } finally {
      setExport(false);
    }
  };

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
      <section className="surface-glass p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Suivi des parcours</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900 lg:text-3xl">Assiduité</h1>
            <p className="mt-1 text-sm text-slate-500">
              Qui revient, et à quels modules. Une personne inscrite sous plusieurs fiches est
              reconnue par son adresse, son téléphone ou son nom.
            </p>
          </div>
          <button onClick={telecharger} className="btn-primary" disabled={export_ || !data?.personnes}>
            {export_ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Exporter CSV
          </button>
        </div>
      </section>

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
            className="select sm:w-56"
          >
            <option value={1}>Tout le monde</option>
            <option value={2}>2 modules et plus</option>
            <option value={3}>3 modules et plus</option>
            <option value={5}>5 modules et plus</option>
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
          {filtres.map((x, i) => {
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
                    {(data.classement.indexOf(x) + 1) || i + 1}
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

      <p className="text-xs text-slate-500">
        {filtres.length} personne{filtres.length > 1 ? "s" : ""} affichée
        {filtres.length > 1 ? "s" : ""} sur {data?.personnes ?? 0}.
      </p>
    </div>
  );
}
