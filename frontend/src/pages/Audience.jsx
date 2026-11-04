import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, Users, Clock, Timer, Loader2, Download, ShieldCheck, Lock,
  Globe, Smartphone, Tablet, Monitor, MousePointerClick, ArrowDownToLine,
  Home, IdCard, Info,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import api from "../api";
import { useToast } from "../components/ui";

/* Le trafic du site, et ce que les visiteurs y font.
 *
 * Réservé aux Admin +, comme le budget : le menu ne montre pas l'entrée aux
 * autres, mais ce n'est qu'un confort — c'est le serveur qui refuse, et il
 * répond « introuvable » plutôt que « interdit ».
 *
 * Deux périmètres seulement : la page d'accueil publique et l'espace des
 * bénéficiaires. La plateforme interne n'est pas mesurée, et c'est un choix
 * dit à l'écran : compter les minutes qu'un coach passe sur un écran serait de
 * la surveillance de collaborateur, pas de la mesure d'audience.
 *
 * La mesure est agrégée. Il n'existe nulle part de ligne « telle personne, tel
 * jour, telle durée » — ni dans la base, ni dans cette page. Ce qui est écrit
 * en haut de l'écran est donc vérifiable : c'est l'architecture, pas une
 * promesse.
 */

const PERIODES = [
  { jours: 7, libelle: "7 jours" },
  { jours: 30, libelle: "30 jours" },
  { jours: 90, libelle: "90 jours" },
  { jours: 365, libelle: "12 mois" },
];

const ESPACES = [
  { cle: "accueil", libelle: "Page d'accueil", icone: Home, couleur: "#f97316" },
  { cle: "espace", libelle: "Espace bénéficiaire", icone: IdCard, couleur: "#0ea5e9" },
];

const SECTIONS = {
  top: "Haut de page",
  centre: "Le centre",
  poles: "Les pôles",
  publics: "Pour qui",
  final: "Appel final",
};

const CLICS = {
  espace: "« Mon espace » (en-tête et pied)",
  "espace-hero": "« Mon espace » (haut de page)",
  decouvrir: "« Découvrir le centre »",
  poles: "« Voir les pôles »",
  mentions: "Mentions légales",
  contact: "Adresse de contact",
};

const SOURCES = {
  direct: "Accès direct",
  interne: "Depuis le site lui-même",
  autre: "Autres provenances",
  google: "Google",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  x: "X (Twitter)",
  youtube: "YouTube",
  tiktok: "TikTok",
  "autre moteur": "Autre moteur de recherche",
};

const APPAREILS = {
  mobile: { libelle: "Téléphone", icone: Smartphone },
  tablette: { libelle: "Tablette", icone: Tablet },
  ordinateur: { libelle: "Ordinateur", icone: Monitor },
};

/* ===== MISE EN FORME ===== */

/* Une durée se lit, elle ne se calcule pas de tête. « 2 min 05 s » plutôt que
   « 125 s », et « 3 h 20 » dès qu'on dépasse l'heure. */
function duree(secondes) {
  const s = Math.max(0, Math.round(Number(secondes) || 0));
  if (s < 60) return `${s} s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m} min ${String(r).padStart(2, "0")} s` : `${m} min`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

const nombre = (n) => (Number(n) || 0).toLocaleString("fr-FR");

function jourCourt(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* La liste complète des journées de la période, y compris celles sans la
   moindre visite. Sans ce remplissage, la courbe relierait le 3 au 9 en
   sautant les jours creux, et une semaine morte ressemblerait à une pente
   douce au lieu d'un trou. */
function journees(du, au) {
  const liste = [];
  const fin = new Date(`${au}T00:00:00Z`).getTime();
  for (let t = new Date(`${du}T00:00:00Z`).getTime(); t <= fin; t += 86400_000) {
    liste.push(new Date(t).toISOString().slice(0, 10));
    if (liste.length > 800) break;
  }
  return liste;
}

/* ===== PETITES BRIQUES D'ÉCRAN ===== */

function Tuile({ icone: Icone, titre, valeur, dessous }) {
  return (
    <div className="card-solid p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icone className="h-4 w-4 text-orange-500" aria-hidden="true" />
        <span className="text-xs font-medium uppercase tracking-wide">{titre}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{valeur}</p>
      {dessous && <p className="mt-0.5 text-xs text-slate-500">{dessous}</p>}
    </div>
  );
}

/* Une barre proportionnelle, utilisée partout où il s'agit de comparer des
   parts entre elles. Le dénominateur est passé explicitement : selon le
   tableau, c'est le plus grand de la liste ou le total des visites, et
   confondre les deux donnerait des pourcentages faux. */
function Barre({ libelle, valeur, total, suffixe, couleur = "bg-orange-500" }) {
  const part = total > 0 ? Math.round((valeur / total) * 100) : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-slate-700">{libelle}</span>
        <span className="flex-shrink-0 tabular-nums text-slate-500">
          {nombre(valeur)}
          {suffixe ? ` ${suffixe}` : ""}
          <span className="ml-1.5 text-xs text-slate-400">{part} %</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${couleur}`}
          style={{ width: `${Math.min(100, part)}%` }}
        />
      </div>
    </li>
  );
}

function Vide({ texte }) {
  return <p className="py-6 text-center text-sm text-slate-400">{texte}</p>;
}

/* ===== LA PAGE ===== */

export default function Audience() {
  const toast = useToast();
  const [jours, setJours] = useState(30);
  const [synthese, setSynthese] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [csv, setCsv] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const { data } = await api.get("/audience/synthese", { params: { jours } });
      setSynthese(data);
    } catch (err) {
      /* 404 est la réponse du serveur à qui n'est pas Admin + : la page n'existe
         pas pour lui. Le garde de route l'a normalement déjà renvoyé ailleurs,
         mais une adresse saisie à la main arrive jusqu'ici. */
      if (err?.response?.status !== 404) {
        toast?.error?.("Impossible de charger la mesure d'audience.");
      }
      setSynthese(null);
    } finally {
      setChargement(false);
    }
  }, [jours, toast]);

  useEffect(() => { charger(); }, [charger]);

  const telecharger = async () => {
    setCsv(true);
    try {
      const { data } = await api.get("/audience/export.csv", {
        params: { jours },
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audience_${synthese?.periode?.du || "export"}_${synthese?.periode?.au || ""}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast?.error?.("L'export a échoué.");
    } finally {
      setCsv(false);
    }
  };

  /* La courbe : une ligne par journée, une colonne par périmètre. Le pivot se
     fait ici et non au serveur — l'API renvoie la forme la plus simple à
     vérifier, une ligne par journée et par périmètre. */
  const courbe = useMemo(() => {
    if (!synthese) return [];
    const parJour = new Map();
    for (const l of synthese.par_jour || []) {
      if (!parJour.has(l.jour)) parJour.set(l.jour, {});
      parJour.get(l.jour)[l.espace] = l.visites;
    }
    return journees(synthese.periode.du, synthese.periode.au).map((j) => ({
      jour: j,
      libelle: jourCourt(j),
      accueil: parJour.get(j)?.accueil || 0,
      espace: parJour.get(j)?.espace || 0,
    }));
  }, [synthese]);

  const t = synthese?.total;
  const accueilVisites = synthese?.par_espace?.accueil?.visites || 0;

  if (chargement && !synthese) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Chargement de la mesure d'audience...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── En-tête ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Activity className="h-5 w-5 text-orange-500" aria-hidden="true" />
            Audience du site
          </h1>
          {synthese && (
            <p className="mt-0.5 text-sm text-slate-500">
              Du {jourCourt(synthese.periode.du)} au {jourCourt(synthese.periode.au)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            {PERIODES.map((p) => (
              <button
                key={p.jours}
                type="button"
                onClick={() => setJours(p.jours)}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  jours === p.jours
                    ? "bg-orange-500 font-medium text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.libelle}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1.5 border text-sm"
            onClick={telecharger}
            disabled={csv || !synthese}
          >
            {csv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV
          </button>
        </div>
      </div>

      {/* ── Ce que cette page est, et ce qu'elle n'est pas ───────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
          <p>
            Cette page n'est visible que des comptes <strong>Admin +</strong>. Les
            autres administrateurs ne la voient pas et ne peuvent pas y accéder.
          </p>
        </div>
        {/* Dit ici parce que c'est une décision, pas un détail technique : la
            mesure est volontairement incapable de suivre quelqu'un. */}
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
          <p>
            Mesure <strong>agrégée</strong>, sans cookie ni identifiant de visiteur :
            aucune ligne nulle part ne dit ce qu'<em>une</em> personne a consulté. La
            plateforme interne n'est pas mesurée.
          </p>
        </div>
      </div>

      {/* ── Les quatre chiffres ──────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tuile
          icone={Activity}
          titre="Visites"
          valeur={nombre(t?.visites)}
          dessous={`${nombre(t?.vues)} page${(t?.vues || 0) > 1 ? "s" : ""} ouverte${(t?.vues || 0) > 1 ? "s" : ""}`}
        />
        <Tuile
          icone={Users}
          titre="Visiteurs"
          valeur={nombre(t?.visiteurs)}
          /* « Visiteurs » compte les premiers passages de chaque journée : un
             visiteur qui revient trois jours de suite compte trois fois, et
             c'est dit pour que personne ne lise « personnes distinctes ». */
          dessous="premiers passages du jour, cumulés"
        />
        <Tuile
          icone={Clock}
          titre="Temps passé"
          valeur={duree(t?.secondes)}
          dessous="présence effective, onglet au premier plan"
        />
        <Tuile
          icone={Timer}
          titre="Durée moyenne"
          valeur={duree(t?.duree_moyenne)}
          dessous={`${t?.part_eclairs || 0} % de visites de moins de 10 s`}
        />
      </div>

      {/* ── La courbe ────────────────────────────────────────────────────── */}
      <div className="card-solid p-5">
        <h2 className="mb-4 font-semibold text-slate-900">Visites par jour</h2>
        {t?.visites ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={courbe} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                {ESPACES.map((e) => (
                  <linearGradient key={e.cle} id={`aud-${e.cle}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={e.couleur} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={e.couleur} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="libelle"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                /* Un jour sur sept au-delà d'un mois : sinon les étiquettes se
                   chevauchent et plus aucune n'est lisible. */
                interval={courbe.length > 40 ? Math.floor(courbe.length / 10) : "preserveStartEnd"}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} tickLine={false} />
              <Tooltip
                formatter={(v, nom) => [
                  `${nombre(v)} visite${v > 1 ? "s" : ""}`,
                  ESPACES.find((e) => e.cle === nom)?.libelle || nom,
                ]}
                labelFormatter={(l, charge) => {
                  const j = charge?.[0]?.payload?.jour;
                  return j
                    ? new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", {
                        weekday: "long", day: "numeric", month: "long",
                      })
                    : l;
                }}
              />
              <Legend
                formatter={(nom) => ESPACES.find((e) => e.cle === nom)?.libelle || nom}
                iconType="circle"
                wrapperStyle={{ fontSize: 12 }}
              />
              {ESPACES.map((e) => (
                <Area
                  key={e.cle}
                  type="monotone"
                  dataKey={e.cle}
                  stroke={e.couleur}
                  strokeWidth={2}
                  fill={`url(#aud-${e.cle})`}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Vide texte="Aucune visite enregistrée sur la période." />
        )}
      </div>

      {/* ── Les deux périmètres, côte à côte ─────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        {ESPACES.map((e) => {
          const d = synthese?.par_espace?.[e.cle];
          const Icone = e.icone;
          return (
            <div key={e.cle} className="card-solid p-5">
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                <Icone className="h-4 w-4" style={{ color: e.couleur }} aria-hidden="true" />
                {e.libelle}
              </h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Visites", nombre(d?.visites)],
                  ["Visiteurs", nombre(d?.visiteurs)],
                  ["Temps passé", duree(d?.secondes)],
                  ["Durée moyenne", duree(d?.duree_moyenne)],
                ].map(([libelle, valeur]) => (
                  <div key={libelle} className="rounded-xl bg-slate-50 px-3 py-2">
                    <dt className="text-xs text-slate-500">{libelle}</dt>
                    <dd className="font-semibold text-slate-900">{valeur}</dd>
                  </div>
                ))}
              </dl>
              {e.cle === "accueil" ? (
                <p className="mt-3 text-xs text-slate-500">
                  {nombre(d?.nouveaux)} visite{(d?.nouveaux || 0) > 1 ? "s" : ""} depuis un
                  navigateur qui découvrait le site.
                </p>
              ) : (
                /* Dit parce que ce chiffre-là est trompeur si on ne le dit pas.
                   « Premier passage du jour » est marqué une seule fois par
                   navigateur et par journée, sur le premier des deux périmètres
                   visités : un bénéficiaire arrivé par la page d'accueil est
                   déjà compté là-bas. Le total général est donc juste, mais le
                   compte des visiteurs de cet espace est un plancher. */
                <p className="mt-3 text-xs text-slate-500">
                  Un bénéficiaire arrivé depuis la page d'accueil est déjà compté comme
                  visiteur du jour là-bas : ce sont les étapes franchies, plus bas, qui
                  mesurent vraiment cet espace.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Provenance et appareil ───────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card-solid p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <Globe className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Par où ils arrivent
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Seul le domaine de provenance est conservé, jamais l'adresse complète.
          </p>
          {synthese?.sources?.length ? (
            <ul className="space-y-3">
              {synthese.sources.slice(0, 10).map((s) => (
                <Barre
                  key={s.valeur}
                  libelle={SOURCES[s.valeur] || s.valeur}
                  valeur={s.nombre}
                  total={synthese.sources.reduce((n, x) => n + x.nombre, 0)}
                  suffixe="visites"
                />
              ))}
            </ul>
          ) : (
            <Vide texte="Aucune provenance enregistrée." />
          )}
        </div>

        <div className="card-solid p-5">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
            <Smartphone className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Sur quel appareil
          </h2>
          {synthese?.appareils?.length ? (
            <ul className="space-y-3">
              {synthese.appareils.map((a) => {
                const meta = APPAREILS[a.valeur];
                const Icone = meta?.icone || Monitor;
                return (
                  <li key={a.valeur} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-slate-700">
                        <Icone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                        {meta?.libelle || a.valeur}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {nombre(a.nombre)}
                        <span className="ml-1.5 text-xs text-slate-400">
                          {Math.round(
                            (a.nombre / synthese.appareils.reduce((n, x) => n + x.nombre, 0)) * 100
                          )}{" "}
                          %
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{
                          width: `${Math.round(
                            (a.nombre / synthese.appareils.reduce((n, x) => n + x.nombre, 0)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Vide texte="Aucun appareil enregistré." />
          )}
        </div>
      </div>

      {/* ── Engagement sur la page d'accueil ─────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card-solid p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <ArrowDownToLine className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Jusqu'où ils descendent
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Part des visites de la page d'accueil ayant atteint chaque section.
          </p>
          {accueilVisites ? (
            <ul className="space-y-3">
              {(synthese.sections || []).map((s) => (
                <Barre
                  key={s.valeur}
                  libelle={SECTIONS[s.valeur] || s.valeur}
                  valeur={s.nombre}
                  total={accueilVisites}
                  suffixe="visites"
                />
              ))}
            </ul>
          ) : (
            <Vide texte="Aucune visite de la page d'accueil sur la période." />
          )}
        </div>

        <div className="card-solid p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <MousePointerClick className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Ce sur quoi ils cliquent
          </h2>
          <p className="mb-4 text-xs text-slate-500">
            Boutons et liens de la page d'accueil, en nombre de clics.
          </p>
          {synthese?.clics?.length ? (
            <ul className="space-y-3">
              {synthese.clics.map((c) => (
                <Barre
                  key={c.valeur}
                  libelle={CLICS[c.valeur] || c.valeur}
                  valeur={c.nombre}
                  total={Math.max(...synthese.clics.map((x) => x.nombre), 1)}
                  suffixe="clics"
                />
              ))}
            </ul>
          ) : (
            <Vide texte="Aucun clic enregistré sur la période." />
          )}
        </div>
      </div>

      {/* ── Le parcours de l'espace bénéficiaire ─────────────────────────── */}
      <div className="card-solid p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
          <IdCard className="h-4 w-4 text-sky-500" aria-hidden="true" />
          Le parcours dans l'espace bénéficiaire
        </h2>
        {/* Ces quatre nombres ne viennent pas du navigateur : ils sont comptés
            au serveur, sur les routes qui rendent le service. Ils sont donc
            exacts, et la précision mérite d'être dite — elle explique pourquoi
            ils peuvent différer des visites mesurées plus haut. */}
        <p className="mb-4 text-xs text-slate-500">
          Compté au serveur, à chaque étape réellement franchie.
        </p>
        {(synthese?.parcours || []).some((e) => e.nombre > 0) ? (
          <ul className="space-y-3">
            {synthese.parcours.map((e, i) => {
              const depart = synthese.parcours[0]?.nombre || 0;
              return (
                <li key={e.etape} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-slate-700">{e.etape}</span>
                    <span className="tabular-nums text-slate-500">
                      {nombre(e.nombre)}
                      {i > 0 && depart > 0 && (
                        <span className="ml-1.5 text-xs text-slate-400">
                          {Math.round((e.nombre / depart) * 100)} % du départ
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{
                        width: `${depart > 0 ? Math.min(100, Math.round((e.nombre / depart) * 100)) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Vide texte="Aucune demande d'accès sur la période." />
        )}
      </div>

      {/* ── Ce que la page ne peut pas dire ─────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
        <p>
          Le détail des visites est conservé {synthese?.periode?.retention || 90} jours, puis
          résumé en totaux journaliers gardés sans limite — les périodes longues restent
          donc lisibles, mais sans leur détail. Un visiteur qui refuse le stockage local
          n'est pas compté : les nombres sont un plancher, jamais un plafond.
        </p>
      </div>
    </div>
  );
}
