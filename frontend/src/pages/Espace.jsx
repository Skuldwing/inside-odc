import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Mail, Loader2, Award, Calendar, MapPin, Globe, Building2,
  Download, LogOut, Users, Info, ArrowLeft,
} from "lucide-react";
import api from "../api";
import ODCLogo from "../components/branding/ODCLogo";

/* L'espace des bénéficiaires.
 *
 * Publique, et sans mot de passe : un bénéficiaire n'a pas de compte, il a une
 * adresse qui figure dans les listes de présence. Il la saisit, reçoit un lien,
 * et ce lien ouvre son dossier.
 *
 * Trois états dans une seule page, parce qu'ils se suivent sans rupture :
 * demander le lien, l'échanger contre une session quand on arrive depuis le
 * courriel, puis consulter. Les séparer en trois adresses obligerait à gérer
 * des redirections pour un parcours qui se lit d'un trait.
 */

function dateCourte(v) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch { return null; }
}

export default function Espace() {
  const [params, setParams] = useSearchParams();
  const jeton = params.get("jeton");

  const [email, setEmail] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState("");
  const [erreur, setErreur] = useState("");

  const [dossier, setDossier] = useState(null);
  const [telechargement, setTelechargement] = useState(null);
  const [chargement, setChargement] = useState(true);

  /* Au chargement : si on arrive depuis le courriel, on échange le jeton ;
     sinon on regarde s'il reste une session ouverte. */
  const demarrer = useCallback(async () => {
    setChargement(true);
    try {
      if (jeton) {
        await api.post("/espace/session", { jeton });
        /* Le jeton est à usage unique : le laisser dans la barre d'adresse
           n'ouvrirait plus rien et le ferait traîner dans l'historique. */
        setParams({}, { replace: true });
      }
      const { data } = await api.get("/espace/moi");
      setDossier(data);
    } catch (err) {
      if (jeton) {
        setErreur(err?.response?.data?.error ||
          "Ce lien n'est plus valable. Demandez-en un nouveau.");
        setParams({}, { replace: true });
      }
      setDossier(null);
    } finally {
      setChargement(false);
    }
  }, [jeton, setParams]);

  useEffect(() => { demarrer(); }, [demarrer]);

  const demanderLien = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur("");
    try {
      const { data } = await api.post("/espace/lien", { email: email.trim() });
      setEnvoye(data.message);
    } catch {
      setErreur("L'envoi a échoué. Réessayez dans un instant.");
    } finally {
      setEnvoi(false);
    }
  };

  const seDeconnecter = async () => {
    try { await api.post("/espace/deconnexion"); } catch { /* sans effet */ }
    setDossier(null);
    setEnvoye("");
  };

  /* Le document est fabriqué à la demande par le serveur, qui vérifie que la
     fiche appartient bien à l'adresse de la session.
   *
     On le récupère par une requête plutôt qu'en ouvrant un onglet : un onglet
     dépend du blocage des fenêtres surgissantes, et en cas de refus il
     afficherait le message d'erreur du serveur en JSON brut — ce qu'un
     bénéficiaire n'a pas à lire. Ici, on sait que ça a échoué et on le dit. */
  const telecharger = async (fiche, formation) => {
    setTelechargement(`${fiche.id}:${formation.activite_id}`);
    setErreur("");
    try {
      const { data } = await api.get(
        `/espace/attestation/${fiche.id}/${formation.activite_id}`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attestation-${formation.intitule}`
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/gi, "-").replace(/-+$/, "").toLowerCase() + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      /* Libéré au tour suivant : révoquer tout de suite couperait le
         téléchargement sur certains navigateurs. */
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setErreur(
        err?.response?.status === 401
          ? "Votre session a expiré. Demandez un nouveau lien d'accès."
          : "Le téléchargement a échoué. Réessayez dans un instant."
      );
    } finally {
      setTelechargement(null);
    }
  };

  if (chargement) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-orange-600">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Retour au site</span>
          </Link>
          {dossier && (
            <button onClick={seDeconnecter}
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-orange-600">
              <LogOut className="w-4 h-4" /> Se déconnecter
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        {!dossier ? (
          /* ── Demander le lien ─────────────────────────────────────────── */
          <div className="mx-auto w-full max-w-md">
            <div className="card-solid p-8">
              <ODCLogo className="mx-auto mb-5 w-full max-w-[280px]" />
              <h1 className="text-center text-xl font-semibold text-slate-900">
                Votre espace bénéficiaire
              </h1>
              <p className="mt-2 text-center text-sm text-slate-500">
                Retrouvez les formations que vous avez suivies et téléchargez vos
                attestations. Pas de mot de passe : indiquez l'adresse que vous
                avez donnée lors de votre inscription, nous vous envoyons un lien.
              </p>

              {envoye ? (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="flex items-start gap-2 text-sm text-emerald-900">
                    <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <span>
                      {envoye}
                      <span className="mt-2 block text-emerald-800">
                        Pensez à regarder dans vos courriers indésirables. Le lien
                        est valable une heure.
                      </span>
                    </span>
                  </p>
                  <button
                    onClick={() => { setEnvoye(""); }}
                    className="mt-3 text-xs text-emerald-800 underline"
                  >
                    Saisir une autre adresse
                  </button>
                </div>
              ) : (
                <form onSubmit={demanderLien} className="mt-6 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Votre adresse e-mail
                    </label>
                    <input
                      type="email"
                      required
                      autoFocus
                      className="input mt-1"
                      placeholder="vous@exemple.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full justify-center"
                    disabled={envoi || !email.trim()}>
                    {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : "Recevoir mon lien d'accès"}
                  </button>
                </form>
              )}

              {erreur && (
                <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {erreur}
                </p>
              )}
            </div>

            {/* Les deux espaces ne s'adressent pas aux mêmes personnes, et la
                page d'accueil mène désormais ici. Le lien reste, discret, pour
                l'équipe et les partenaires qui arrivent par la racine. */}
            <p className="mt-6 text-center text-xs text-slate-400">
              Vous faites partie de l'équipe ou d'un partenaire&nbsp;?{" "}
              <Link to="/login" className="text-slate-500 underline hover:text-orange-600">
                Connexion à la plateforme
              </Link>
            </p>
          </div>
        ) : (
          /* ── Le dossier ───────────────────────────────────────────────── */
          <div className="space-y-6">
            {erreur && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{erreur}</p>
            )}

            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Vos formations</h1>
              <p className="mt-1 text-sm text-slate-500">
                Dossier rattaché à <strong>{dossier.email}</strong>
              </p>
            </div>

            {dossier.partagee && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                <p>
                  Cette adresse est partagée par <strong>{dossier.fiches.length} personnes</strong>.
                  Vous voyez donc plusieurs dossiers ci-dessous. Si l'un d'eux ne
                  vous concerne pas, c'est normal — et vous pouvez nous demander
                  de séparer les adresses.
                </p>
              </div>
            )}

            {dossier.fiches.length === 0 && (
              <div className="card-solid p-8 text-center text-slate-500">
                Aucune formation n'est rattachée à cette adresse pour le moment.
              </div>
            )}

            {dossier.fiches.map((fiche) => (
              <section key={fiche.id} className="card-solid p-5">
                <h2 className="font-semibold text-slate-900">{fiche.nom}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {fiche.formations.length} formation{fiche.formations.length !== 1 ? "s" : ""}
                </p>

                {fiche.formations.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">
                    Aucune formation enregistrée sur ce dossier.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {fiche.formations.map((f) => (
                      <li key={f.activite_id}
                        className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">{f.intitule}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                              {dateCourte(f.date) && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5" />{dateCourte(f.date)}
                                </span>
                              )}
                              {f.mode === "ligne" ? (
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3.5 h-3.5" />En ligne
                                </span>
                              ) : f.lieu ? (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" />{f.lieu}
                                </span>
                              ) : null}
                              {f.organisateur && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3.5 h-3.5" />{f.organisateur}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => telecharger(fiche, f)}
                            disabled={telechargement === `${fiche.id}:${f.activite_id}`}
                            className="btn-ghost border text-sm inline-flex items-center gap-1.5 shrink-0"
                          >
                            {telechargement === `${fiche.id}:${f.activite_id}`
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Download className="w-4 h-4" />}
                            Attestation
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <div className="flex items-start gap-2 text-xs text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <p>
                Une formation manque, un nom est mal orthographié, ou un dossier ne
                vous concerne pas&nbsp;?{" "}
                <a href="mailto:contact@inside-odc.com?subject=Mon%20espace%20b%C3%A9n%C3%A9ficiaire"
                  className="text-orange-600 underline">Écrivez-nous</a>, nous
                corrigerons. Les attestations sont fabriquées au moment du
                téléchargement, à partir des listes de présence.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
