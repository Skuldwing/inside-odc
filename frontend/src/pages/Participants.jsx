import { useEffect, useCallback, useState, useRef } from "react";
import { Users, Search, Download, Filter, UserRound, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Check, TrendingUp, List, X, RotateCcw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import api from "../api";
import { EmptyState, DensityToggle, useDensity, useToast, useConfirm } from "../components/ui";
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
            {/* Reconnu par l'adresse ou le numéro : c'est ce que la détection
                par le nom seul manquait. On dit sur quoi, sinon deux noms
                différents dans un même groupe n'ont pas d'explication. */}
            {g.noms_differents && (
              <span className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                {g.partage?.length
                  ? `reconnues par ${g.partage.map((p) => `le même ${p.libelle}`).join(" et ")}`
                  : "noms écrits différemment"}
              </span>
            )}
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

          {/* Le tableau s'affiche toujours : même sans aucun renseignement, il
              montre comment le nom est écrit sur chaque fiche — ce qui est la
              première chose à regarder quand c'est l'adresse ou le numéro qui
              les a rapprochées. */}
          <span className="mt-2 block overflow-x-auto">
              <table className="w-full min-w-[30rem] text-left text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pb-1 pr-3 font-medium">Fiche</th>
                    {/* Le nom de chaque fiche, désormais indispensable : un
                        groupe reconnu par l'adresse ou le numéro peut porter
                        deux écritures différentes du nom, et c'est justement ce
                        qu'il faut voir pour décider. */}
                    <th className="pb-1 pr-3 font-medium">Nom écrit</th>
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
                      <td className="py-1 pr-3 text-slate-700">
                        {[f.prenom, f.nom].filter(Boolean).join(" ").trim() || (
                          <span className="text-slate-300">sans nom</span>
                        )}
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
          {colonnes.length === 0 && (
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
 * Deux fois la même personne sur une même activité.
 *
 * Ce ne sont pas deux fiches à réunir : ce sont deux inscriptions, sur la même
 * liste de présence. L'activité compte un bénéficiaire de trop, et la personne
 * recevra deux fois son attestation.
 *
 * Ce qui est retiré est le lien entre la fiche et cette activité-là — jamais la
 * fiche. Les deux fiches restent, avec toutes leurs autres formations. C'est la
 * différence avec l'ancienne « réunion », qui supprimait la fiche et faisait
 * disparaître quelqu'un de listes où il avait vraiment été présent. Et le
 * retrait se défait : remettre le lien, c'est tout.
 */
const MOTIFS_RAPPROCHEMENT = {
  identite_identique: "même nom, même prénom",
  nom_plus_complet: "même contact, et un prénom écrit en entier une fois sur deux",
  identite_incomplete: "identité incomplète, rien qui les distingue",
};

function DoublonsActivite({ onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [ecartes, setEcartes] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const [retirees, setRetirees] = useState(null);

  const charger = useCallback(async () => {
    try {
      const [vue, journal] = await Promise.all([
        api.get("/participants/doublons-activite"),
        api.get("/participants/inscriptions-retirees").catch(() => ({ data: null })),
      ]);
      setData(vue.data);
      setRetirees(journal.data);
      /* Les groupes qui demandent un coup d'œil partent décochés : un prénom
         composé peut cacher deux personnes différentes. */
      setEcartes(new Set((vue.data.groupes || []).filter((g) => !g.certain).map((g) => g.cle)));
    } catch {
      setData(null);   /* silencieux : c'est une réparation, pas la page */
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const groupes = data?.groupes || [];
  const aRetablir = (retirees?.lignes || []).filter((l) => !l.retablie);
  if (!groupes.length && !aRetablir.length) return null;

  const retenus = groupes.filter((g) => !ecartes.has(g.cle));
  const inscriptionsRetenues = retenus.reduce((n, g) => n + g.retirer.length, 0);

  const basculer = (cle) =>
    setEcartes((prec) => {
      const suivant = new Set(prec);
      if (suivant.has(cle)) suivant.delete(cle); else suivant.add(cle);
      return suivant;
    });

  const retirer = async (tout) => {
    const combien = tout ? data.total : inscriptionsRetenues;
    if (!combien) return;
    const ok = await confirm({
      title: `Ne compter qu'une fois ${combien > 1 ? `ces ${combien} inscriptions` : "cette inscription"} ?`,
      body: "Rien n'est supprimé. Les fiches sont rattachées à une même personne : la ligne de la liste de présence reste telle qu'elle a été écrite, et c'est le nombre de personnes distinctes qui baisse — c'est le but, il comptait la même personne deux fois. Chaque rapprochement est inscrit au journal et se défait à l'identique. En masse, seuls les rapprochements adossés à une adresse ou un numéro partagé sont appliqués : ceux qui ne reposent que sur le nom attendent que vous les désigniez, car deux personnes peuvent porter le même.",
      confirmLabel: "Rapprocher",
    });
    if (!ok) return;
    setEnCours(true);
    try {
      const res = await api.post(
        "/participants/doublons-activite/retirer",
        tout ? { tout: true } : { groupes: retenus.map((g) => g.cle) }
      );
      const laisses = res.data.laisses_sur_nom_seul || 0;
      toast.success(
        `${res.data.retirees} fiche${res.data.retirees > 1 ? "s" : ""} rapprochée${res.data.retirees > 1 ? "s" : ""} ` +
        `sur ${res.data.activites} activité${res.data.activites > 1 ? "s" : ""}. Aucune ligne de présence supprimée.` +
        /* Taire ce qui reste ferait croire le travail fini. */
        (laisses ? ` ${laisses} groupe${laisses > 1 ? "s" : ""} sur nom seul à regarder.` : "")
      );
      /* La liste et les compteurs de la page datent d'avant : sans ce
         rechargement, ils annonceraient encore les doublons qu'on vient de
         retirer. */
      await Promise.all([charger(), onChange?.()]);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Le retrait a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  const retablir = async () => {
    setEnCours(true);
    try {
      const res = await api.post("/participants/inscriptions-retirees/retablir", {
        journaux: aRetablir.map((l) => l.journal),
      });
      toast.success(
        `${res.data.retablies} inscription${res.data.retablies > 1 ? "s" : ""} remise${res.data.retablies > 1 ? "s" : ""} en place.`
      );
      await Promise.all([charger(), onChange?.()]);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La remise en place a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <section className="card-solid overflow-hidden border border-orange-300">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-orange-600" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {data?.total > 0
              ? `${data.total} inscription${data.total > 1 ? "s" : ""} en double sur ${data.activites} activité${data.activites > 1 ? "s" : ""}`
              : "Inscriptions retirées"}
          </span>
          <span className="block text-xs text-slate-500">
            {data?.total > 0 ? (
              <>
                La même personne compte deux fois sur la même liste de présence
                {/* Dire sur quoi repose chaque rapprochement, et combien
                    n'ont que le nom pour eux : c'est la seule information qui
                    permette de décider. */}
                {data.certains > 0 && (
                  <span className="text-emerald-700">
                    {" "}· {data.certains} prouvé{data.certains > 1 ? "s" : ""} par une adresse ou un numéro
                  </span>
                )}
                {data.sur_nom_seul > 0 && (
                  <span className="text-amber-700">
                    {" "}· {data.sur_nom_seul} sur le nom seul, à regarder
                  </span>
                )}
              </>
            ) : (
              `${aRetablir.length} retrait${aRetablir.length > 1 ? "s" : ""} au journal, à remettre en place si besoin`
            )}
          </span>
        </span>
        <span className="text-xs text-slate-500">{ouvert ? "Masquer" : "Voir la liste"}</span>
      </button>

      {ouvert && (
        <div className="border-t border-orange-200">
          {groupes.length > 0 && (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {groupes.map((g) => (
                <li key={g.cle} className={`px-4 py-3 text-xs ${ecartes.has(g.cle) ? "opacity-50" : ""}`}>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={!ecartes.has(g.cle)}
                      onChange={() => basculer(g.cle)}
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-orange-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-semibold text-slate-800">
                          {g.garder.prenom} {g.garder.nom}
                        </span>
                        <span className="text-slate-500">
                          {g.activite.titre}
                          {g.activite.date ? ` (${formatDate(g.activite.date)})` : ""}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            g.certain
                              ? "border-orange-300 bg-orange-50 text-orange-800"
                              : "border-amber-300 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {MOTIFS_RAPPROCHEMENT[g.motif] || g.motif}
                        </span>
                        {/* Deux personnes peuvent porter le même nom. Sans
                            coordonnée pour trancher, on le dit plutôt que de
                            laisser croire que la machine a reconnu quelqu'un. */}
                        {g.preuve === "nom_seul" && (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            nom seul — à confirmer
                          </span>
                        )}
                      </span>

                      {/* Ce qui reste, et ce qui est retiré : la ligne conservée
                          d'abord, pour qu'on voie tout de suite que personne ne
                          disparaît de la liste. */}
                      <span className="mt-1.5 block space-y-0.5">
                        <span className="block text-emerald-700">
                          reste inscrit : fiche {g.garder.id} —{" "}
                          {[g.garder.email, g.garder.telephone].filter(Boolean).join(" · ") ||
                            "aucune coordonnée"}
                          {g.garder.total_activites > 1 && ` · ${g.garder.total_activites} formations`}
                        </span>
                        {g.retirer.map((f) => (
                          <span key={f.id} className="block text-slate-500">
                            retirée de cette activité : fiche {f.id}
                            {(f.prenom || f.nom) && ` — ${[f.prenom, f.nom].filter(Boolean).join(" ")}`}
                            {" — "}
                            {[f.email, f.telephone].filter(Boolean).join(" · ") || "aucune coordonnée"}
                            {f.total_activites > 1
                              ? ` · la fiche reste sur ${f.total_activites - 1} autre${f.total_activites > 2 ? "s" : ""} formation${f.total_activites > 2 ? "s" : ""}`
                              : " · la fiche est conservée"}
                          </span>
                        ))}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {data?.tronquee && (
            <p className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              Les 300 premiers groupes sont affichés. Traitez ceux-ci, rechargez la page : la
              suite apparaîtra.
            </p>
          )}

          {groupes.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
              <p className="max-w-xl text-xs text-slate-500">
                <strong className="text-slate-600">Aucune fiche n&apos;est supprimée.</strong> Seul
                le lien avec l&apos;activité est retiré : les fiches gardent toutes leurs autres
                formations. L&apos;effectif des activités concernées baisse — c&apos;est le but, il
                comptait la même personne deux fois. Une fiche qui n&apos;a plus aucune activité
                sort de la liste ci-dessous, qui n&apos;affiche que les personnes rattachées à une
                activité : elle existe toujours et revient dès qu&apos;on remet l&apos;inscription.
                Chaque retrait est inscrit au journal.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => retirer(true)}
                  disabled={enCours}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {/* « Tout » ne veut pas dire « tout ce qui se ressemble » :
                      le bouton n'emporte que ce qu'une adresse ou un numéro
                      partagé prouve. Annoncer le total serait mentir sur ce
                      qu'il fait. */}
                  {enCours
                    ? "Rapprochement…"
                    : `Rapprocher les ${data.certains ?? 0} cas sûrs`}
                </button>
                {inscriptionsRetenues > 0 && inscriptionsRetenues < data.total && (
                  <button
                    type="button"
                    onClick={() => retirer(false)}
                    disabled={enCours}
                    className="rounded-xl border border-orange-300 px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                  >
                    {inscriptionsRetenues > 1
                      ? `Seulement les ${inscriptionsRetenues} cochées`
                      : "Seulement celle cochée"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Le retour en arrière, au même endroit que l'action : c'est là qu'on
              le cherche quand on s'aperçoit qu'un retrait était faux. */}
          {aRetablir.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <p className="max-w-xl text-xs text-slate-500">
                {aRetablir.length} inscription{aRetablir.length > 1 ? "s" : ""} retirée
                {aRetablir.length > 1 ? "s" : ""} par cet écran
                {aRetablir.length > 1 ? " peuvent" : " peut"} être remise
                {aRetablir.length > 1 ? "s" : ""} en place :{" "}
                {aRetablir.slice(0, 4).map((l) => `${l.nom} (${l.activite})`).join(", ")}
                {aRetablir.length > 4 && `, et ${aRetablir.length - 4} autre(s)`}.
              </p>
              <button
                type="button"
                onClick={retablir}
                disabled={enCours}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-60"
              >
                Tout remettre en place
              </button>
            </div>
          )}
        </div>
      )}
    </section>
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
function FichesARestaurer({ onChange }) {
  const toast = useToast();
  const confirm = useConfirm();
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

  /* Cocher ligne à ligne est le bon geste quand on veut trier. Quand on veut
     tout remettre — le cas le plus fréquent, puisque la réunion n'aurait jamais
     dû supprimer quoi que ce soit — cocher cinquante cases est une corvée. Le
     bouton fait les deux : sans sélection, il prend tout, après confirmation. */
  const restaurer = async (journaux) => {
    const liste = journaux ?? [...choisies];
    if (!liste.length) return;
    setEnCours(true);
    try {
      const res = await api.post("/participants/fiches-absorbees/restaurer", {
        journaux: liste,
      });
      toast.success(
        `${res.data.restaurees} fiche${res.data.restaurees > 1 ? "s" : ""} remise${res.data.restaurees > 1 ? "s" : ""} en place, ` +
        `${res.data.inscriptions} inscription${res.data.inscriptions > 1 ? "s" : ""} rétablie${res.data.inscriptions > 1 ? "s" : ""}.`
      );
      setChoisies(new Set());
      await Promise.all([charger(), onChange?.()]);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La restauration a échoué.");
    } finally {
      setEnCours(false);
    }
  };

  const toutRestaurer = async () => {
    const ok = await confirm({
      title: `Remettre en place les ${aRestaurer.length} fiches ?`,
      body: `Chaque fiche est recréée avec ses inscriptions : les effectifs des activités concernées remontent d'autant. Si l'une de ces réunions était juste — deux fiches qui étaient bien la même personne sur la même formation —, elle regonflera un effectif à tort ; vous pourrez la supprimer depuis la liste de l'activité.`,
      confirmLabel: "Tout remettre en place",
    });
    if (!ok) return;
    await restaurer(aRestaurer.map((l) => l.journal));
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
        <span className="text-xs text-slate-500">
          {ouvert ? "Masquer" : "Voir et tout remettre"}
        </span>
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

          {data?.tronquee && (
            <p className="border-t border-slate-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {data.total_journal} suppressions au journal, les 1000 plus récentes sont affichées.
              Restaurez celles-ci, rechargez la page : la suite apparaîtra.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <p className="max-w-xl text-xs text-slate-500">
              La fiche est recréée avec ses inscriptions : les effectifs concernés remontent.
              Elle reçoit un nouvel identifiant — l&apos;ancien est perdu — mais les listes de
              présence retrouvent leur ligne. Ces fiches n&apos;auraient jamais dû être
              supprimées :{" "}
              <strong className="text-slate-600">tout remettre est le geste normal</strong>. Si
              l&apos;une de ces réunions était juste, elle regonflera un effectif à tort — vous
              pourrez retirer la ligne depuis la liste de l&apos;activité.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {/* Le geste le plus courant : tout remettre. Il ne demande pas
                  de cocher cinquante cases, seulement de confirmer. */}
              <button
                type="button"
                onClick={toutRestaurer}
                disabled={enCours}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {enCours ? "Restauration…" : `Tout remettre en place (${aRestaurer.length})`}
              </button>
              {/* La sélection reste possible pour qui veut trier. */}
              {choisies.size > 0 && (
                <button
                  type="button"
                  onClick={() => restaurer()}
                  disabled={enCours}
                  className="rounded-xl border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {choisies.size > 1
                    ? `Seulement les ${choisies.size} cochées`
                    : "Seulement celle cochée"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * La revue des groupes que le nom seul soutient.
 *
 * Les groupes qu'une adresse ou un numéro prouve se traitent d'un bloc, sans
 * qu'on ait à les regarder. Restent ceux qui ne tiennent qu'au nom. La
 * plateforme refuse de trancher à la place de quelqu'un — c'est juste, deux
 * personnes peuvent porter le même nom — mais refuser de trancher sans donner
 * de quoi le faire revient à ne rien proposer du tout.
 *
 * Un groupe à la fois, donc, avec ce qui permet de décider : ce qui décrit la
 * personne, et les formations de chaque fiche. Ces dernières pèsent lourd —
 * deux fiches sur la MÊME formation sont le cas le plus probable d'homonymes,
 * tandis que deux formations différentes décrivent quelqu'un qui est revenu.
 *
 * Trois issues, pas deux. « Je ne sais pas » compte autant que les autres :
 * forcer un choix binaire sur des fiches qui ne portent rien produirait des
 * décisions au hasard, c'est-à-dire exactement ce qu'on veut éviter.
 */
function RevueDesGroupes({ onChange }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [position, setPosition] = useState(0);
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async (pos) => {
    try {
      const r = await api.get("/participants/fiches-doublons/revue", { params: { position: pos } });
      setData(r.data);
    } catch {
      setData(null); /* silencieux : c'est un panneau d'appoint, pas la page */
    }
  }, []);

  useEffect(() => { charger(position); }, [charger, position]);

  const decider = async (decision) => {
    const fiches = (data?.groupe?.fiches || []).map((f) => f.id);
    if (fiches.length < 2) return;
    setEnCours(true);
    try {
      await api.post("/participants/fiches-doublons/decision", { fiches, decision });
      toast.success(
        decision === "meme_personne"
          ? "Fiches rattachées à une même personne. Aucune ligne de présence supprimée."
          : "Noté : ces fiches désignent deux personnes. Ce groupe ne sera plus proposé."
      );
      /* On reste à la même position : le groupe tranché quitte la file, et
         c'est le suivant qui vient s'y présenter. Avancer d'un cran ferait
         sauter un groupe à chaque décision. */
      await charger(position);
      await onChange?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || "La décision n'a pas été enregistrée.");
    } finally {
      setEnCours(false);
    }
  };

  if (!data?.total) return null;
  const g = data.groupe;

  /* Ce qui décrit la personne — pas ce qu'elle a fait. C'est là-dessus qu'on
     décide, et les valeurs qui diffèrent sont signalées. */
  const CHAMPS = [
    ["genre", "Genre"],
    ["age_range", "Tranche d'âge"],
    ["structure", "Structure"],
    ["statut", "Statut"],
    ["email", "E-mail"],
    ["telephone", "Téléphone"],
  ];
  const valeursDe = (champ) =>
    new Set((g?.fiches || []).map((f) => normaliser(champ, f[champ])).filter((v) => v !== null));

  return (
    <section className="card-solid overflow-hidden border border-violet-300">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <UserRound className="h-5 w-5 flex-shrink-0 text-violet-600" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {data.total} groupe{data.total > 1 ? "s" : ""} à trancher à la main
          </span>
          <span className="block text-xs text-slate-500">
            Ces fiches portent le même nom, et rien d&apos;autre ne dit si c&apos;est la même
            personne. Deux personnes peuvent porter le même nom — d&apos;où cette revue.
            {data.traites_automatiquement > 0 && (
              <span className="text-emerald-700">
                {" "}· {data.traites_automatiquement} autre
                {data.traites_automatiquement > 1 ? "s sont traités" : " est traité"} sans
                décision, par le bouton ci-dessus
              </span>
            )}
          </span>
        </span>
        <span className="text-xs text-slate-500">{ouvert ? "Masquer" : "Commencer la revue"}</span>
      </button>

      {ouvert && g && (
        <div className="border-t border-violet-200 px-4 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">
              Groupe {position + 1} sur {data.total}
            </span>
            {g.activite_partagee && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                deux fiches sur la même formation — probablement deux personnes
              </span>
            )}
            {g.conflits?.length > 0 && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                {g.conflits.length} désaccord{g.conflits.length > 1 ? "s" : ""}
              </span>
            )}
            {g.noms_differents && (
              <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                noms écrits différemment
              </span>
            )}
          </div>

          {/* Les fiches côte à côte : c'est la comparaison qui décide, pas un
              résumé de la comparaison. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pb-1 pr-3 font-medium">&nbsp;</th>
                  {g.fiches.map((f) => (
                    <th key={f.id} className="pb-1 pr-3 font-medium">
                      fiche {f.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-500">Nom écrit</td>
                  {g.fiches.map((f) => (
                    <td key={f.id} className="py-1 pr-3 font-medium text-slate-800">
                      {[f.prenom, f.nom].filter(Boolean).join(" ").trim() || (
                        <span className="text-slate-300">sans nom</span>
                      )}
                    </td>
                  ))}
                </tr>
                {CHAMPS.map(([champ, libelle]) => {
                  const distinctes = valeursDe(champ).size > 1;
                  return (
                    <tr key={champ} className="border-t border-slate-100">
                      <td className="py-1 pr-3 text-slate-500">{libelle}</td>
                      {g.fiches.map((f) => (
                        <td
                          key={f.id}
                          className={`py-1 pr-3 ${distinctes ? "font-medium text-amber-700" : "text-slate-700"}`}
                        >
                          {f[champ] || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                <tr className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-500">Formations</td>
                  {g.fiches.map((f) => (
                    <td key={f.id} className="py-1 pr-3 text-slate-700">
                      {(f.activites || []).length === 0 ? (
                        <span className="text-slate-300">aucune</span>
                      ) : (
                        <span className="block space-y-0.5">
                          {(f.activites || []).map((a) => (
                            <span key={a.id} className="block">
                              {a.titre}
                              {a.date && (
                                <span className="text-slate-400"> · {formatDate(a.date)}</span>
                              )}
                            </span>
                          ))}
                          {f.activites_total > (f.activites || []).length && (
                            <span className="block text-slate-400">
                              et {f.activites_total - f.activites.length} autre
                              {f.activites_total - f.activites.length > 1 ? "s" : ""}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => decider("meme_personne")}
              disabled={enCours}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              C&apos;est la même personne
            </button>
            <button
              type="button"
              onClick={() => decider("deux_personnes")}
              disabled={enCours}
              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Ce sont deux personnes
            </button>
            {/* La troisième issue. Sans elle, un groupe muet force un choix au
                hasard — et c'est précisément ce qu'on cherche à éviter. */}
            <button
              type="button"
              onClick={() => setPosition((p) => p + 1)}
              disabled={enCours || position + 1 >= data.total}
              className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              Je ne sais pas — passer
            </button>
            {position > 0 && (
              <button
                type="button"
                onClick={() => setPosition((p) => Math.max(0, p - 1))}
                disabled={enCours}
                className="rounded-xl px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-40"
              >
                Revenir au précédent
              </button>
            )}
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Rien n&apos;est supprimé dans un cas comme dans l&apos;autre. « La même personne »
            rattache les fiches — le nombre de bénéficiaires se corrige, les lignes de
            présence ne bougent pas, et le rattachement se défait. « Deux personnes » se
            retient : ce groupe ne reviendra plus.
          </p>
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

  /* Tous les filtres dans un seul objet : ils partent ensemble au serveur, se
     réinitialisent ensemble, et se comptent ensemble pour dire combien sont
     actifs. Les tenir en variables séparées obligeait à les énumérer à chaque
     appel, et le jour où l'on en ajoute un, à ne pas en oublier un seul. */
  const FILTRES_VIDES = {
    search: "", genre: "", dispositif: "", partenaire: "",
    statut: "", age: "", du: "", au: "",
  };
  const [filtres, setFiltres] = useState(() => ({
    ...FILTRES_VIDES,
    search: searchParams.get("q") || "",
  }));
  const [search, setSearch]           = useState(searchParams.get("q") || "");
  const [page, setPage]               = useState(1);

  /* Ce que le serveur connaît de la base, dans le périmètre de la personne
     connectée : de quoi remplir les listes déroulantes sans proposer des
     choix qui ne rendraient aucune ligne. */
  const [choix, setChoix] = useState({
    dispositifs: [], partenaires: [], statuts: [], ages: [],
  });
  /* Quand le serveur ne sait pas répondre — typiquement parce qu'il exécute
     encore une version antérieure, qui ignore cette route —, les listes
     restent vides et les filtres ne font rien. Sans ce signal, la page a
     simplement l'air cassée : on la dit en panne plutôt que de laisser
     chercher pourquoi. */
  const [choixEnPanne, setChoixEnPanne] = useState(false);

  const filtresActifs = Object.entries(filtres)
    .filter(([cle, v]) => cle !== "search" && String(v || "").trim() !== "").length;

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
      fetchPage(filtresEnvoyes.current, page);
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
         une adresse plutôt qu'une autre ne se décide pas tout seul —, ceux où
         deux fiches figurent sur la même formation, qui ne s'expliquent pas par
         une personne revenue et sont le cas le plus probable d'homonymes, et
         ceux reconnus par l'adresse ou le numéro dont les noms sont écrits
         différemment : le rapprochement est solide, mais il se regarde. */
      setEcartes(
        new Set(
          (res.data?.groupes || [])
            .filter((g) => g.conflits?.length > 0 || g.activite_partagee || g.noms_differents)
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
      /* Deux effets désormais : les cases vides se remplissent, et les fiches
         qu'une adresse ou un numéro rapproche sont rattachées à une même
         personne — ce qui corrige enfin les comptes, sans rien supprimer. */
      const rattachees = res.data.fiches_rattachees || 0;
      const laisses = res.data.groupes_sur_nom_seul || 0;
      const morceaux = [];
      if (res.data.champs_remplis) {
        morceaux.push(
          `${res.data.champs_remplis} information${res.data.champs_remplis > 1 ? "s" : ""} complétée${res.data.champs_remplis > 1 ? "s" : ""} sur ${res.data.fiches_completees} fiche${res.data.fiches_completees > 1 ? "s" : ""}`
        );
      }
      if (rattachees) {
        morceaux.push(
          `${rattachees} fiche${rattachees > 1 ? "s" : ""} rattachée${rattachees > 1 ? "s" : ""} à la même personne`
        );
      }
      toast.success(
        (morceaux.length
          ? morceaux.join(" · ") + ". Aucune fiche supprimée."
          : "Rien à faire : ces fiches portent déjà la même information.") +
        /* Taire ce qui reste ferait croire le travail fini. */
        (laisses ? ` ${laisses} groupe${laisses > 1 ? "s" : ""} sur nom seul à regarder.` : "")
      );
      setFichesOuvertes(false);
      await chercherFiches();
      fetchPage(filtresEnvoyes.current, page);
    } catch (err) {
      toast.error(err?.response?.data?.error || "La complétion a échoué.");
    } finally {
      setFusion(false);
    }
  };

  /* Debounce search → réinitialise la page */
  const debounceRef = useRef(null);
  /* Les filtres réellement partis au serveur. La recherche est temporisée :
     entre la frappe et l'appel, l'état React n'est pas encore celui qu'on
     veut interroger, et un rechargement déclenché entre-temps — par un des
     panneaux de réparation — rappellerait l'ancienne recherche. */
  const filtresEnvoyes = useRef(filtres);

  const parametresDe = (f) => {
    const p = {};
    for (const [cle, valeur] of Object.entries(f)) {
      if (String(valeur || "").trim() !== "") p[cle] = String(valeur).trim();
    }
    return p;
  };

  const fetchPage = useCallback(async (filtresVal, pageVal) => {
    filtresEnvoyes.current = filtresVal;
    setLoading(true);
    setError("");
    try {
      const params = { page: pageVal, ...parametresDe(filtresVal) };
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

  /* Ce que les panneaux de réparation font bouger : la liste, ses compteurs, et
     la détection des fiches multiples. Sans ce rappel, l'écran continuait
     d'annoncer après coup les doublons qu'on venait de traiter. */
  const rechargerListe = useCallback(async () => {
    await Promise.all([
      fetchPage(filtresEnvoyes.current, page),
      chercherFiches(),
    ]);
  }, [fetchPage, chercherFiches, page]);

  /* Chargement initial */
  useEffect(() => {
    fetchPage(filtres, page);
    chercherDoublons();
    chercherFiches();
    api.get("/participants/filtres")
      .then((r) => {
        setChoix({
          dispositifs: r.data?.dispositifs || [],
          partenaires: r.data?.partenaires || [],
          statuts: r.data?.statuts || [],
          ages: r.data?.ages || [],
        });
        setChoixEnPanne(false);
      })
      .catch(() => setChoixEnPanne(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Un filtre change → on repart de la première page. Rester sur la page 7
     d'un résultat qui n'en fait plus que deux affiche un tableau vide sans
     rien expliquer. */
  const changerFiltre = (cle, valeur) => {
    const suivant = { ...filtres, [cle]: valeur };
    setFiltres(suivant);
    setPage(1);
    fetchPage(suivant, 1);
  };

  const reinitialiser = () => {
    clearTimeout(debounceRef.current);
    setFiltres(FILTRES_VIDES);
    setSearch("");
    setPage(1);
    fetchPage(FILTRES_VIDES, 1);
  };

  /* Recherche avec debounce 350ms → reset page 1 */
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const suivant = { ...filtres, search: val };
      setFiltres(suivant);
      setPage(1);
      fetchPage(suivant, 1);
    }, 350);
  };

  /* Changement de page */
  const goToPage = (p) => {
    setPage(p);
    fetchPage(filtresEnvoyes.current, p);
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
      /* Exactement les filtres de l'écran : ce qu'on voit est ce qu'on
         télécharge, sinon le fichier ne correspond pas à ce qu'on a demandé. */
      const params = parametresDe(filtresEnvoyes.current);

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

      <FichesARestaurer onChange={rechargerListe} />

      {/* Deux inscriptions pour une personne sur la même liste de présence :
          l'effectif compte un bénéficiaire de trop, et elle recevrait deux fois
          son attestation. Ce panneau retire le lien en trop, jamais la fiche. */}
      <DoublonsActivite onChange={rechargerListe} />

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
                {/* Ce que la détection par le nom seul manquait : on le dit,
                    parce que c'est la nouveauté du panneau. */}
                {fiches.reconnus_par_contact > 0 && (
                  <>
                    {fiches.a_completer > 0 && " · "}
                    {fiches.reconnus_par_contact} reconnue
                    {fiches.reconnus_par_contact > 1 ? "s" : ""} par l&apos;adresse ou le numéro
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
                  {" "}Le rapprochement se fait sur l&apos;identité, et sur l&apos;adresse ou le
                  numéro quand le nom est écrit différemment d&apos;une fiche à l&apos;autre. Un
                  contact partagé ne suffit jamais seul : deux frères qui utilisent la même
                  adresse restent deux personnes. Les lignes reconnues par le contact, celles
                  qui se contredisent et celles où deux fiches figurent sur la même formation
                  partent décochées.
                </p>
                {/* Ce que le bouton fait vraiment, maintenant qu'il fait deux
                    choses. Sans cette phrase, « compléter » laisse croire que
                    seules les cases vides bougent. */}
                <p className="mb-2 text-xs text-slate-600">
                  Les cases vides se remplissent avec ce que les autres fiches portent, et
                  celles qu&apos;une <strong>adresse ou un numéro partagé</strong> rapproche sont
                  rattachées à une même personne — le nombre de bénéficiaires se corrige,
                  aucune ligne de présence ne bouge, et chaque rattachement se défait.
                  Les groupes qui ne reposent que sur le nom sont complétés mais pas
                  rattachés : deux personnes peuvent porter le même.
                </p>
                <button
                  type="button"
                  onClick={completerFiches}
                  disabled={fusion || idsRetenus.length === 0}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                >
                  {fusion ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {fusion
                    ? "En cours…"
                    : `Compléter et rattacher ${idsRetenus.length} fiche${idsRetenus.length > 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* La revue : les groupes que le nom seul soutient, un par un. */}
      <RevueDesGroupes onChange={rechargerListe} />

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
        <div className="mb-3 flex flex-wrap items-center gap-2 text-slate-700">
          <Filter className="h-4 w-4 text-orange-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Recherche et filtres</h2>
          {filtresActifs > 0 && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
              {filtresActifs} filtre{filtresActifs > 1 ? "s" : ""} actif{filtresActifs > 1 ? "s" : ""}
            </span>
          )}
          <DensityToggle className="ml-auto" />
        </div>

        {/* La recherche prend toute la largeur : c'est par elle qu'on passe
            neuf fois sur dix, les listes déroulantes servent à dégrossir. */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Nom, prénom, téléphone, e-mail, structure, activité…"
            className="input pl-10 pr-10"
            aria-label="Rechercher un participant"
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearch("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Ce que la recherche sait faire ne se devine pas : sans cette ligne,
            personne n'essaie de taper un nom entier ni un numéro. */}
        <p className="mt-1.5 text-xs text-slate-500">
          Plusieurs mots se cumulent — « aminata ndiaye » ou « ndiaye kids tech ».
          Les accents sont ignorés, et un numéro se tape comme il s'écrit.
        </p>

        {choixEnPanne && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>
              Les listes de filtres n&apos;ont pas pu être chargées, et les
              filtres ci-dessous resteront sans effet. Le serveur exécute
              probablement une version antérieure&nbsp;: signalez-le à
              l&apos;équipe technique. La recherche par nom, elle, fonctionne.
            </span>
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <select
            className="select" value={filtres.genre} aria-label="Genre"
            onChange={(e) => changerFiltre("genre", e.target.value)}
          >
            <option value="">Tous les genres</option>
            <option value="H">Hommes</option>
            <option value="F">Femmes</option>
          </select>

          <select
            className="select" value={filtres.dispositif} aria-label="Dispositif"
            onChange={(e) => changerFiltre("dispositif", e.target.value)}
          >
            <option value="">Tous les dispositifs</option>
            {choix.dispositifs.map((d) => (
              <option key={d.id} value={d.id}>{d.nom}</option>
            ))}
          </select>

          <select
            className="select" value={filtres.partenaire} aria-label="Partenaire"
            onChange={(e) => changerFiltre("partenaire", e.target.value)}
          >
            <option value="">Tous les partenaires</option>
            {choix.partenaires.map((p) => (
              <option key={p.id} value={p.id}>{p.nom}</option>
            ))}
          </select>

          <select
            className="select" value={filtres.statut} aria-label="Statut"
            onChange={(e) => changerFiltre("statut", e.target.value)}
          >
            <option value="">Tous les statuts</option>
            {choix.statuts.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="select" value={filtres.age} aria-label="Tranche d'âge"
            onChange={(e) => changerFiltre("age", e.target.value)}
          >
            <option value="">Toutes les tranches d&apos;âge</option>
            {choix.ages.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Les bornes de date valent séparément : « depuis le 1er janvier »
              est une demande aussi courante que « entre deux dates ». */}
          <div className="flex items-center gap-2">
            <label className="flex-1">
              <span className="sr-only">Activités à partir du</span>
              <input
                type="date" className="input" value={filtres.du}
                max={filtres.au || undefined}
                onChange={(e) => changerFiltre("du", e.target.value)}
              />
            </label>
            <span className="text-xs text-slate-500">au</span>
            <label className="flex-1">
              <span className="sr-only">Activités jusqu&apos;au</span>
              <input
                type="date" className="input" value={filtres.au}
                min={filtres.du || undefined}
                onChange={(e) => changerFiltre("au", e.target.value)}
              />
            </label>
          </div>
        </div>

        {(filtresActifs > 0 || search) && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">
              {loading
                ? "Recherche…"
                : `${total.toLocaleString("fr-FR")} inscription${total !== 1 ? "s" : ""} correspondent.`}
            </p>
            <button
              type="button"
              onClick={reinitialiser}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Tout effacer
            </button>
          </div>
        )}
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
