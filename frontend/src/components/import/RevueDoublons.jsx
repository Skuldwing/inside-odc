import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CopyCheck,
  Loader2,
  Merge,
  Split,
  AlertTriangle,
} from "lucide-react";

/**
 * La revue des doublons d'une liste, avant qu'elle n'entre.
 *
 * C'est le premier garde-fou : la plateforme cherche qui figure deux fois
 * sur la liste — nom et prénom dans les deux ordres, accents, écritures
 * différentes (Ndiaye / Ndiay, Mouhamed / Mohamed), fautes de frappe,
 * numéros écrits avec ou sans +221, adresses Gmail avec ou sans points — et
 * dit, pour chaque groupe, ce qui a servi de preuve.
 *
 * Trois niveaux. Les deux premiers sont réunis par défaut, le troisième non ;
 * chaque décision se change ici, avant d'importer. Rien n'est réuni en
 * silence, et rien n'est mélangé aux autres listes de la base.
 */

export const NIVEAUX_DOUBLON = {
  certain: {
    libelle: "Certain",
    aide: "même nom et même téléphone ou email",
    pastille: "border-rose-200 bg-rose-50 text-rose-800",
  },
  probable: {
    libelle: "Probable",
    aide: "même nom, rien qui les sépare",
    pastille: "border-amber-200 bg-amber-50 text-amber-800",
  },
  a_verifier: {
    libelle: "À vérifier",
    aide: "homonymes possibles — à vous de dire",
    pastille: "border-sky-200 bg-sky-50 text-sky-800",
  },
};

const ORDRE = ["a_verifier", "probable", "certain"];
const PAR_PAGE = 20;

/* La décision de chaque groupe, telle que l'analyse la propose. */
export function decisionsParDefaut(groupes) {
  return Object.fromEntries((groupes || []).map((g) => [g.id, g.defaut]));
}

/* Ce qu'on envoie au serveur : les ensembles de lignes à réunir. */
export function fusionsDepuis(groupes, decisions) {
  return (groupes || [])
    .filter((g) => (decisions?.[g.id] ?? g.defaut) === "fusionner")
    .map((g) => g.lignes);
}

/* Combien de lignes disparaîtront en tant que personnes distinctes : les
   groupes peuvent se recouvrir, on compte donc sur les ensembles réunis. */
function lignesReunies(groupes, decisions) {
  const parent = new Map();
  const racine = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  for (const lignes of fusionsDepuis(groupes, decisions)) {
    for (const l of lignes.slice(1)) {
      const a = racine(lignes[0]);
      const b = racine(l);
      if (a !== b) parent.set(b, a);
    }
  }
  const lignes = [...parent.keys()];
  return lignes.length - new Set(lignes.map(racine)).size;
}

function LigneFichier({ l }) {
  const nom = [l.prenom, l.nom].filter(Boolean).join(" ") || "— sans nom —";
  const contacts = [l.telephone, l.email].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-0.5">
      <span className="min-w-[3.5rem] shrink-0 font-mono text-[11px] text-slate-500">
        {l.ligne_excel ? `ligne ${l.ligne_excel}` : l.etiquette || ""}
      </span>
      <span className="font-medium text-slate-800">{nom}</span>
      {contacts ? (
        <span className="min-w-0 break-all text-slate-600">{contacts}</span>
      ) : (
        <span className="italic text-slate-400">sans contact</span>
      )}
      {(l.genre || l.tranche_age) && (
        <span className="text-slate-500">
          {[l.genre, l.tranche_age].filter(Boolean).join(", ")}
        </span>
      )}
      {l.autres_activites > 0 && (
        <span className="text-slate-500">
          · inscrite à {l.autres_activites} autre{l.autres_activites > 1 ? "s" : ""} activité
          {l.autres_activites > 1 ? "s" : ""}
        </span>
      )}
    </li>
  );
}

function CarteGroupe({ g, decision, onChange, lectureSeule }) {
  const niveau = NIVEAUX_DOUBLON[g.niveau] || NIVEAUX_DOUBLON.a_verifier;
  const parLigne = new Map(g.detail.map((l) => [l.ligne, l]));
  /* Pour une question, les personnes mises en regard ; sinon, les lignes. */
  const blocs =
    g.cotes && g.cotes.some((c) => c.length > 1)
      ? g.cotes.map((c) => c.map((l) => parLigne.get(l)).filter(Boolean))
      : [g.detail];
  const reunir = decision === "fusionner";

  return (
    <div
      className={`rounded-xl border bg-white p-3 text-xs ${reunir ? "border-slate-300" : "border-slate-200"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${niveau.pastille}`}
        >
          {niveau.libelle}
        </span>
        <span className="min-w-0 flex-1 text-slate-600">
          {g.raisons.join(" · ")}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {blocs.map((bloc, i) => (
          <ul
            key={i}
            className={
              blocs.length > 1 ? "rounded-lg bg-slate-50 px-2 py-1" : ""
            }
          >
            {bloc.map((l) => (
              <LigneFichier key={l.ligne} l={l} />
            ))}
          </ul>
        ))}
      </div>

      <div
        className="mt-2 inline-flex overflow-hidden rounded-lg border border-slate-300"
        role="radiogroup"
        aria-label="Décision pour ce groupe"
      >
        <button
          type="button"
          role="radio"
          aria-checked={reunir}
          disabled={lectureSeule}
          onClick={() => onChange(g.id, "fusionner")}
          className={`inline-flex items-center gap-1 px-2.5 py-1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            reunir
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Merge className="h-3.5 w-3.5" aria-hidden="true" />
          Même personne
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!reunir}
          disabled={lectureSeule}
          onClick={() => onChange(g.id, "separer")}
          className={`inline-flex items-center gap-1 border-l border-slate-300 px-2.5 py-1 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
            !reunir
              ? "bg-slate-800 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Split className="h-3.5 w-3.5" aria-hidden="true" />
          Personnes différentes
        </button>
      </div>
    </div>
  );
}

function Section({ niveau, groupes, decisions, onChange, lectureSeule }) {
  const [tout, setTout] = useState(false);
  if (!groupes.length) return null;
  const visibles = tout ? groupes : groupes.slice(0, PAR_PAGE);
  const info = NIVEAUX_DOUBLON[niveau];
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700">
        {info.libelle} — {groupes.length} groupe{groupes.length > 1 ? "s" : ""}
        <span className="font-normal text-slate-500"> · {info.aide}</span>
      </p>
      {visibles.map((g) => (
        <CarteGroupe
          key={g.id}
          g={g}
          decision={decisions?.[g.id] ?? g.defaut}
          onChange={onChange}
          lectureSeule={lectureSeule}
        />
      ))}
      {groupes.length > PAR_PAGE && (
        <button
          type="button"
          onClick={() => setTout((v) => !v)}
          className="text-xs font-medium text-orange-700 hover:underline"
        >
          {tout
            ? "Réduire"
            : `Afficher les ${groupes.length - PAR_PAGE} autres`}
        </button>
      )}
    </div>
  );
}

/**
 * @param {object}   analyse   { groupes, resume } renvoyé par le serveur
 * @param {object}   decisions { [id du groupe]: "fusionner" | "separer" }
 * @param {Function} onChange  (decisionsMisesAJour) => void
 * @param {boolean}  lectureSeule  liste gardée telle quelle : rien n'est réuni
 */
export default function RevueDoublons({
  analyse,
  decisions,
  onChange,
  lectureSeule = false,
  chargement = false,
  erreur = "",
  lignesAnalysees,
  aide,
}) {
  const groupes = useMemo(() => analyse?.groupes ?? [], [analyse]);
  const parNiveau = useMemo(() => {
    const m = Object.fromEntries(ORDRE.map((n) => [n, []]));
    for (const g of groupes) (m[g.niveau] || m.a_verifier).push(g);
    return m;
  }, [groupes]);

  if (chargement && !analyse) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Recherche des doublons dans la liste…
      </div>
    );
  }
  if (erreur) {
    return (
      <p className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {erreur}
      </p>
    );
  }
  if (!analyse) return null;

  if (!groupes.length) {
    return (
      <p className="flex items-start gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          <strong>Aucun doublon dans la liste</strong>
          {lignesAnalysees ? ` (${lignesAnalysees} lignes comparées)` : ""}.
          Noms dans les deux ordres, variantes d&apos;écriture, fautes de
          frappe, téléphones et emails ont été comparés.
        </span>
      </p>
    );
  }

  const changer = (id, valeur) => onChange({ ...decisions, [id]: valeur });
  const reunies = lignesReunies(groupes, decisions);
  const { resume = {} } = analyse;

  return (
    <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <CopyCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800">
            Doublons dans la liste : {groupes.length} groupe
            {groupes.length > 1 ? "s" : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">
            {resume.certains || 0} certain{(resume.certains || 0) > 1 ? "s" : ""}
            {" · "}
            {resume.probables || 0} probable{(resume.probables || 0) > 1 ? "s" : ""}
            {" · "}
            {resume.a_verifier || 0} à vérifier
            {lectureSeule ? (
              <> — liste gardée telle quelle : aucune ligne ne sera réunie.</>
            ) : (
              <>
                {" "}— {reunies} ligne{reunies > 1 ? "s" : ""} ser
                {reunies > 1 ? "ont" : "a"} réunie{reunies > 1 ? "s" : ""} à
                une autre.
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {aide ||
              "Les groupes « certains » et « probables » sont réunis, les « à vérifier » restent séparés. Changez ce qui ne va pas : vous connaissez la salle mieux que la règle. La liste n'est jamais mélangée aux fiches des autres listes."}
          </p>
        </div>
      </div>

      {!lectureSeule && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange(decisionsParDefaut(groupes))}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
          >
            Revenir aux propositions
          </button>
          <button
            type="button"
            onClick={() =>
              onChange(Object.fromEntries(groupes.map((g) => [g.id, "separer"])))
            }
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"
          >
            Tout garder séparé
          </button>
        </div>
      )}

      {ORDRE.map((n) => (
        <Section
          key={n}
          niveau={n}
          groupes={parNiveau[n]}
          decisions={decisions}
          onChange={changer}
          lectureSeule={lectureSeule}
        />
      ))}

      {chargement && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          Mise à jour du décompte…
        </p>
      )}
    </div>
  );
}
