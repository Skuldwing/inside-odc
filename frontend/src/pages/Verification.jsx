import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, Calendar, MapPin, Loader2, AlertCircle } from "lucide-react";
import api from "../api";

/* La page où un bénéficiaire répond à la contre-vérification. Une question,
   deux boutons. Rien ne s'enregistre à l'ouverture : les messageries ouvrent
   les liens toutes seules, seule un clic ici vaut réponse. */

const dateLongue = (d) => {
  if (!d) return "";
  const x = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  return x.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

export default function Verification() {
  const { jeton } = useParams();
  const [etat, setEtat] = useState({ chargement: true, erreur: "", donnees: null });
  const [commentaire, setCommentaire] = useState("");
  const [envoi, setEnvoi] = useState(null);

  useEffect(() => {
    let vivant = true;
    api.get(`/verification/${encodeURIComponent(jeton)}`)
      .then((r) => vivant && setEtat({ chargement: false, erreur: "", donnees: r.data }))
      .catch((e) => vivant && setEtat({
        chargement: false,
        erreur: e?.response?.data?.error || "Ce lien n'est pas valide.",
        donnees: null,
      }));
    return () => { vivant = false; };
  }, [jeton]);

  const repondre = async (reponse) => {
    setEnvoi(reponse);
    try {
      const r = await api.post(`/verification/${encodeURIComponent(jeton)}`, { reponse, commentaire });
      setEtat((s) => ({ ...s, donnees: { ...s.donnees, reponse: r.data.reponse } }));
    } catch (e) {
      const deja = e?.response?.data?.reponse;
      if (deja) setEtat((s) => ({ ...s, donnees: { ...s.donnees, reponse: deja } }));
      else setEtat((s) => ({ ...s, erreur: e?.response?.data?.error || "La réponse n'a pas pu être enregistrée." }));
    } finally {
      setEnvoi(null);
    }
  };

  const d = etat.donnees;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-orange-100 bg-white p-6 shadow-xl shadow-orange-100/50 sm:p-8">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-orange-600">Orange Digital Center</p>

        {etat.chargement && (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </p>
        )}

        {!etat.chargement && !d && (
          <div className="mt-6 flex items-start gap-3 text-sm text-slate-600">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
            <p>{etat.erreur}</p>
          </div>
        )}

        {d && !d.reponse && (
          <>
            <h1 className="mt-3 text-xl font-bold leading-snug text-slate-900">
              {d.prenom ? `${d.prenom}, avez-vous participé à cette activité ?` : "Avez-vous participé à cette activité ?"}
            </h1>
            <div className="mt-4 rounded-2xl border-l-4 border-orange-500 bg-orange-50 p-4">
              <p className="font-semibold text-slate-900">{d.activite}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <Calendar className="h-3.5 w-3.5" /> {dateLongue(d.date)}
              </p>
              {(d.lieu || d.partenaire) && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                  <MapPin className="h-3.5 w-3.5" />
                  {[d.lieu, d.partenaire && `avec ${d.partenaire}`].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            <label htmlFor="commentaire" className="mt-4 block text-xs font-medium text-slate-500">
              Un mot à ajouter ? (facultatif)
            </label>
            <textarea
              id="commentaire"
              rows={2}
              maxLength={1000}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
            />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => repondre("oui")}
                disabled={Boolean(envoi)}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {envoi === "oui" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Oui, j&apos;y étais
              </button>
              <button
                type="button"
                onClick={() => repondre("non")}
                disabled={Boolean(envoi)}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {envoi === "non" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Non, je n&apos;y étais pas
              </button>
            </div>
            {etat.erreur && <p className="mt-3 text-sm text-red-600">{etat.erreur}</p>}
            <p className="mt-4 text-xs text-slate-400">
              Votre réponse sert uniquement à vérifier la qualité des activités menées avec nos partenaires.
            </p>
          </>
        )}

        {d?.reponse && (
          <div className="mt-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-3 text-lg font-bold text-slate-900">Merci{d.prenom ? `, ${d.prenom}` : ""} !</h1>
            <p className="mt-1 text-sm text-slate-600">
              Votre réponse est enregistrée{d.reponse === "oui" ? " : vous avez participé." : " : vous n'avez pas participé."}
              {" "}Vous pouvez fermer cette page.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
