import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, RefreshCw, Send, OctagonAlert } from "lucide-react";
import api from "../../api";
import { retourVers } from "../../navigation/retour";
import { useConfirm, useToast } from "../ui";

/* Demander aux bénéficiaires eux-mêmes. Chaque mois, un échantillon tiré au
   hasard dans les listes de chaque partenaire reçoit une question : « Avez-vous
   participé ? ». Le taux de confirmation dit à quel point une liste est
   crédible ; les « non » désignent les activités à revoir. */

const moisPrecedent = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const libelleMois = (m) => {
  if (!m) return "";
  const [a, n] = m.split("-").map(Number);
  return new Date(a, n - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
};
const pct = (x) => `${Math.round(x * 100)} %`;

export default function ContreVerification() {
  const toast = useToast();
  const confirm = useConfirm();
  const [donnees, setDonnees] = useState(null);
  const [mois, setMois] = useState("");
  const [tirage, setTirage] = useState({ mois: moisPrecedent(), taux: 5, minimum: 10 });
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async (m) => {
    try {
      const res = await api.get("/controle/verifications", { params: m ? { mois: m } : {} });
      setDonnees(res.data);
      setMois(res.data.mois || "");
    } catch (err) {
      toast.error(err?.response?.data?.error || "Impossible de charger les résultats.");
    }
  }, [toast]);

  useEffect(() => { charger(); }, [charger]);

  const enAttente = useMemo(
    () => (donnees?.partenaires || []).reduce((s, p) => s + p.en_attente, 0),
    [donnees]
  );
  const erreurs = useMemo(
    () => (donnees?.partenaires || []).reduce((s, p) => s + p.erreurs, 0),
    [donnees]
  );
  /* Pendant l'envoi, on suit l'avancement sans recharger à la main. */
  useEffect(() => {
    if (!enAttente) return undefined;
    const t = setTimeout(() => charger(mois), 4000);
    return () => clearTimeout(t);
  }, [enAttente, mois, charger]);

  const tirer = async () => {
    const ok = await confirm({
      title: `Tirer l'échantillon de ${libelleMois(tirage.mois)} ?`,
      body:
        `${tirage.taux} % des personnes joignables de chaque partenaire (au moins ${tirage.minimum}) seront tirées au ` +
        "hasard et recevront tout de suite un email leur demandant si elles ont bien participé. " +
        "Un mois ne se tire qu'une fois.",
      confirmLabel: "Tirer et envoyer",
    });
    if (!ok) return;
    setEnCours(true);
    try {
      const res = await api.post("/controle/verifications/tirage", tirage);
      toast.success(`${res.data.tires} bénéficiaires tirés chez ${res.data.partenaires} partenaire${res.data.partenaires > 1 ? "s" : ""} : envoi en cours.`);
      await charger(tirage.mois);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Le tirage n'a pas abouti.");
    } finally {
      setEnCours(false);
    }
  };

  const renvoyer = async () => {
    try {
      const res = await api.post(`/controle/verifications/${mois}/renvoyer`);
      toast.success(`${res.data.relances} message${res.data.relances > 1 ? "s" : ""} relancé${res.data.relances > 1 ? "s" : ""}.`);
      await charger(mois);
    } catch (err) {
      toast.error(err?.response?.data?.error || "Le renvoi n'a pas abouti.");
    }
  };

  const partenaires = donnees?.partenaires || [];
  const negatives = donnees?.negatives || [];

  return (
    <div className="space-y-4">
      <section className="card-solid space-y-3 p-4" aria-labelledby="titre-tirage">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <div className="text-sm text-slate-600">
            <h2 id="titre-tirage" className="font-semibold text-slate-900">Tirer un échantillon</h2>
            <p>
              Les personnes tirées reçoivent un email : « Avez-vous participé à … ? Oui / Non ». Elles répondent d&apos;un
              clic sur une page dédiée ; ouvrir l&apos;email ne compte pas comme une réponse. Les désabonnés et les
              fiches sans email ne sont pas tirés.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mois des activités
            <input
              type="month"
              className="input mt-1 w-44"
              value={tirage.mois}
              onChange={(e) => setTirage((t) => ({ ...t, mois: e.target.value }))}
            />
          </label>
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Part de chaque liste
            <span className="mt-1 flex items-center gap-1">
              <input
                type="number" min={1} max={100} className="input w-20"
                value={tirage.taux}
                onChange={(e) => setTirage((t) => ({ ...t, taux: Number(e.target.value) }))}
              />
              <span className="text-sm normal-case text-slate-500">%</span>
            </span>
          </label>
          <label className="flex flex-col text-xs font-semibold uppercase tracking-wide text-slate-500">
            Au moins, par partenaire
            <input
              type="number" min={1} max={500} className="input mt-1 w-24"
              value={tirage.minimum}
              onChange={(e) => setTirage((t) => ({ ...t, minimum: Number(e.target.value) }))}
            />
          </label>
          <button type="button" onClick={tirer} disabled={enCours || !tirage.mois} className="btn-primary disabled:opacity-50">
            {enCours ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Tirer et envoyer
          </button>
        </div>
      </section>

      {donnees && !donnees.campagnes.length && (
        <div className="card-solid p-10 text-center text-sm text-slate-500">
          Aucun échantillon tiré pour l&apos;instant.
        </div>
      )}

      {donnees?.campagnes.length > 0 && (
        <section className="card-solid space-y-3 p-4" aria-labelledby="titre-resultats">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="titre-resultats" className="font-semibold text-slate-900">
              Résultats — activités de {libelleMois(mois)}
            </h2>
            <div className="flex items-center gap-2">
              <select
                aria-label="Campagne"
                className="select w-48"
                value={mois}
                onChange={(e) => charger(e.target.value)}
              >
                {donnees.campagnes.map((c) => (
                  <option key={c.campagne} value={c.campagne}>
                    {libelleMois(c.campagne)} ({c.tires})
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => charger(mois)} className="btn-ghost border border-slate-200 bg-white text-sm">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {(enAttente > 0 || erreurs > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                {enAttente > 0 && <>Envoi en cours : {enAttente} message{enAttente > 1 ? "s" : ""} en attente. </>}
                {erreurs > 0 && <>{erreurs} message{erreurs > 1 ? "s" : ""} non parti{erreurs > 1 ? "s" : ""}.</>}
              </span>
              {erreurs > 0 && enAttente === 0 && (
                <button type="button" onClick={renvoyer} className="font-medium text-orange-700 hover:underline">
                  Renvoyer
                </button>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Partenaire</th>
                  <th className="px-3 py-2 text-right">Interrogés</th>
                  <th className="px-3 py-2 text-right">Réponses</th>
                  <th className="px-3 py-2 text-right">Oui</th>
                  <th className="px-3 py-2 text-right">Non</th>
                  <th className="px-3 py-2">Taux de confirmation</th>
                </tr>
              </thead>
              <tbody>
                {partenaires.map((p) => {
                  const reponses = p.oui + p.non;
                  const taux = reponses ? p.oui / reponses : null;
                  return (
                    <tr key={p.partner_id ?? "sans"} className="table-row">
                      <td className="px-3 py-2 font-medium text-slate-800">{p.partenaire}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.tires}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {reponses}
                        {p.envoyes > 0 && <span className="text-slate-400"> ({pct(reponses / p.envoyes)})</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{p.oui}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${p.non ? "font-semibold text-red-700" : ""}`}>{p.non}</td>
                      <td className="px-3 py-2">
                        {taux == null ? (
                          <span className="text-xs text-slate-400">pas encore de réponse</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                              <span
                                className={`block h-full rounded-full ${taux >= 0.9 ? "bg-emerald-500" : taux >= 0.7 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${Math.round(taux * 100)}%` }}
                              />
                            </span>
                            <span className="text-xs font-semibold tabular-nums text-slate-700">{pct(taux)}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {negatives.length > 0 && (
        <section className="card-solid space-y-2 p-4" aria-labelledby="titre-non">
          <h2 id="titre-non" className="flex items-center gap-2 font-semibold text-red-800">
            <OctagonAlert className="h-4 w-4" />
            Ils disent ne pas avoir participé ({negatives.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {negatives.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  {n.participant_id ? (
                    <Link to={`/participants/${n.participant_id}`} className="font-medium text-slate-800 hover:underline">
                      {n.prenom} {n.nom}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-800">{n.email}</span>
                  )}
                  <span className="text-slate-500"> — sur la liste de {n.partenaire}, pour </span>
                  {n.activity_id ? (
                    <Link to={`/activities/${n.activity_id}`} state={retourVers("/fiabilite", "Retour à la fiabilité")} className="text-orange-700 hover:underline">« {n.title} »</Link>
                  ) : "une activité supprimée"}
                  {n.commentaire && <p className="mt-0.5 text-xs italic text-slate-600">« {n.commentaire} »</p>}
                </div>
                <span className="text-xs text-slate-400">
                  {n.repondu_le ? new Date(n.repondu_le).toLocaleDateString("fr-FR") : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
