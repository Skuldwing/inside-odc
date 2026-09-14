import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import api from "../api";

/**
 * Etat d'authentification du domaine expediteur.
 *
 * Depuis fevrier 2024, Gmail, Yahoo et Microsoft refusent les messages dont le
 * domaine n'est pas authentifie. Rien dans la plateforme ne permettait de
 * savoir ou on en etait : on decouvrait le probleme par les messages qui
 * n'arrivaient pas. Ce panneau interroge le DNS en direct.
 */

const LIBELLES = {
  spf: "SPF — qui a le droit d'envoyer",
  dkim: "DKIM — signature des messages",
  dmarc: "DMARC — que faire en cas d'echec",
  verification_brevo: "Vérification du domaine chez Brevo",
  reception: "Réception (MX)",
};

const ORDRE = ["spf", "dkim", "dmarc", "verification_brevo", "reception"];

/* Refus qui ne viennent pas du service d'envoi mais de la route elle-meme :
   ils n'ont donc ni cause ni remede dans le corps de la reponse. */
const ECHECS_HTTP = {
  401: {
    cause: "Votre session a expiré.",
    remede: "Reconnectez-vous, puis relancez l'essai.",
  },
  403: {
    cause: "Cette action est réservée aux administrateurs.",
    remede: "Connectez-vous avec un compte administrateur.",
  },
  404: {
    cause: "Cette version du serveur ne connaît pas l'envoi d'essai.",
    remede:
      "Le site a été mis à jour avant l'API : le bouton existe, la route pas encore. Attendez la fin du déploiement du serveur, puis rechargez avec Ctrl+Maj+R. Si cela persiste, c'est que le déploiement a échoué.",
  },
  429: {
    cause: "Trop de requêtes en peu de temps.",
    remede: "Attendez une minute avant de relancer l'essai.",
  },
  502: { cause: "Le serveur est injoignable.", remede: "Il redémarre peut-être. Réessayez dans une minute." },
  503: { cause: "Le serveur est indisponible.", remede: "Il redémarre peut-être. Réessayez dans une minute." },
  504: { cause: "Le serveur n'a pas répondu à temps.", remede: "Réessayez dans une minute." },
};

/**
 * Rend un echec lisible, quelle que soit la forme de la reponse.
 *
 * Un premier jet affichait directement le corps de l'erreur en supposant qu'il
 * portait toujours « cause » et « remede ». Un 404 rend la page HTML d'Express,
 * un mandataire en panne rend la sienne, une reponse peut etre vide : il ne
 * restait alors qu'une bande rouge sans un mot, ce qui est pire que rien. Le
 * statut est toujours affiche, ne serait-ce que pour pouvoir le rapporter.
 */
function echecLisible(err) {
  const reponse = err?.response;
  const corps = reponse?.data;

  /* Le cas nominal : la route a repondu dans sa propre forme. */
  if (corps && typeof corps === "object" && (corps.cause || corps.remede)) {
    return { success: false, ...corps };
  }

  if (!reponse) {
    return {
      success: false,
      cause: "Le serveur n'a pas répondu.",
      remede:
        "Vérifiez que l'API est en ligne et que l'adresse du site est bien autorisée dans CORS_ORIGIN.",
      brut: String(err?.message || "").slice(0, 300),
    };
  }

  const statut = reponse.status;
  const connu = ECHECS_HTTP[statut];

  /* On garde une trace du corps, mais lisible : une page d'erreur HTML sans
     ses balises tient en une ligne et dit souvent l'essentiel. */
  let brut = "";
  if (typeof corps === "string") {
    brut = corps.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  } else if (corps && typeof corps === "object") {
    brut = corps.error || corps.message || JSON.stringify(corps);
  }

  return {
    success: false,
    cause: connu?.cause || `Le serveur a refusé la demande (HTTP ${statut}).`,
    remede: connu?.remede || "Le message ci-dessous vient du serveur.",
    brut: `HTTP ${statut}${brut ? ` — ${brut.slice(0, 300)}` : ""}`,
  };
}

function Pastille({ statut }) {
  if (statut === "ok") {
    return <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />;
  }
  if (statut === "attention") {
    return <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden="true" />;
  }
  return <XCircle className="h-4 w-4 flex-shrink-0 text-red-600" aria-hidden="true" />;
}

export default function DeliverabilitePanel() {
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [ouvert, setOuvert] = useState(false);
  /* Domaine explicitement demande par l'administrateur. Vide = celui qui est
     configure sur le serveur. Sert a jauger un domaine candidat — par exemple
     orange-sonatel.com — avant de basculer l'expedition dessus. */
  const [domaineSaisi, setDomaineSaisi] = useState("");
  const [domaineTeste, setDomaineTeste] = useState("");
  /* Résultat du dernier envoi d'essai : succès, ou le refus du serveur tel
     qu'il l'a formulé. */
  const [essai, setEssai] = useState(null);
  const [essaiEnCours, setEssaiEnCours] = useState(false);
  const [adresseEssai, setAdresseEssai] = useState("");

  const charger = useCallback(async (domaine = "") => {
    setChargement(true);
    setErreur("");
    try {
      const res = await api.get("/email/diagnostic", domaine ? { params: { domaine } } : undefined);
      setData(res.data);
      setDomaineTeste(domaine);
      /* On n'ouvre le detail d'office que s'il y a quelque chose a corriger :
         quand tout va bien, une ligne suffit. */
      const ko = Object.values(res.data.controles || {}).filter((c) => c.statut !== "ok").length;
      /* Une verification demandee a la main reste toujours visible : on vient
         d'en faire la demande, la replier serait absurde. */
      setOuvert(Boolean(domaine) || ko > 0 || (res.data.configuration?.alertes || []).length > 0);
    } catch (err) {
      setErreur(err?.response?.data?.error || "Diagnostic indisponible.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const envoyerEssai = async () => {
    setEssaiEnCours(true);
    setEssai(null);
    try {
      const res = await api.post("/email/test", adresseEssai.trim() ? { destinataire: adresseEssai.trim() } : {});
      setEssai(res.data);
    } catch (err) {
      setEssai(echecLisible(err));
    } finally {
      setEssaiEnCours(false);
    }
  };

  if (chargement && !data) {
    return (
      <div className="card-solid flex items-center gap-2 p-4 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Vérification du domaine expéditeur…
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="card-solid p-4 text-sm text-slate-600">
        {erreur}
      </div>
    );
  }

  if (!data) return null;

  const controles = data.controles || {};
  const alertes = data.configuration?.alertes || [];
  const bloquants = ORDRE.filter((c) => controles[c] && controles[c].statut === "manquant");
  const tout_ok = bloquants.length === 0 && alertes.length === 0;

  return (
    <section
      className={`card-solid overflow-hidden border ${
        tout_ok ? "border-emerald-200" : "border-amber-300"
      }`}
    >
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={ouvert}
      >
        <ShieldCheck
          className={`h-5 w-5 flex-shrink-0 ${tout_ok ? "text-emerald-600" : "text-amber-600"}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-800">
            {domaineTeste
              ? `Vérification de ${domaineTeste}`
              : tout_ok
              ? "Domaine expéditeur authentifié"
              : `Envoi d'emails : ${bloquants.length + alertes.length} point${
                  bloquants.length + alertes.length > 1 ? "s" : ""
                } à corriger`}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {data.domaine ? `${data.domaine} · ` : ""}
            envoi via {data.configuration?.fournisseur || "aucun service"}
            {data.configuration?.repondre_a ? ` · réponses vers ${data.configuration.repondre_a}` : ""}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${ouvert ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {ouvert && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4">
          {alertes.map((a) => (
            <p
              key={a}
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>{a}</span>
            </p>
          ))}

          <ul className="space-y-2">
            {ORDRE.filter((cle) => controles[cle]).map((cle) => {
              const c = controles[cle];
              return (
                <li key={cle} className="flex items-start gap-2">
                  <Pastille statut={c.statut} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{LIBELLES[cle]}</p>
                    <p className="text-xs text-slate-600">{c.detail}</p>
                    {c.valeur && (
                      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{c.valeur}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {bloquants.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <p className="font-medium text-slate-800">Ces enregistrements se posent dans le DNS</p>
              <p className="mt-1">
                Ils ne dépendent pas de la plateforme : c&apos;est l&apos;administrateur de la zone
                DNS du domaine qui doit les créer. Les valeurs exactes de DKIM et du code de
                vérification sont fournies par Brevo, dans <em>Expéditeurs &amp; IP → Domaines</em>.
                Revenez ici ensuite : la propagation prend de quelques minutes à quelques heures.
              </p>
            </div>
          )}

          {/* Un envoi réel vaut mieux que cinq contrôles DNS : c'est le seul
              test qui dise si le service d'envoi accepte nos messages. */}
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[12rem] flex-1 text-xs text-slate-600">
                Envoyer un email d&apos;essai
                <input
                  type="email"
                  value={adresseEssai}
                  onChange={(e) => setAdresseEssai(e.target.value)}
                  placeholder="votre adresse (par défaut)"
                  className="input mt-1 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={envoyerEssai}
                disabled={essaiEnCours}
                className="btn-ghost border text-xs"
              >
                {essaiEnCours ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Envoyer
              </button>
            </div>

            {essai && (
              <div
                className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                  essai.success
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                {essai.success ? (
                  <>
                    <p className="font-medium">Message accepté pour {essai.destinataire}</p>
                    <p className="mt-1">{essai.message}</p>
                  </>
                ) : (
                  <>
                    {/* Garde-fou : une bande rouge muette ne dit rien à personne. */}
                    <p className="font-medium">{essai.cause || "L'envoi a échoué, sans motif indiqué par le serveur."}</p>
                    {essai.remede && <p className="mt-1">{essai.remede}</p>}
                    {essai.brut && (
                      <p className="mt-2 break-all font-mono text-[11px] opacity-70">{essai.brut}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              charger(domaineSaisi.trim());
            }}
            className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3"
          >
            <label className="min-w-[12rem] flex-1 text-xs text-slate-600">
              Vérifier un autre domaine
              <input
                type="text"
                value={domaineSaisi}
                onChange={(e) => setDomaineSaisi(e.target.value)}
                placeholder="orange-sonatel.com"
                className="input mt-1 text-sm"
              />
            </label>
            <button type="submit" disabled={chargement || !domaineSaisi.trim()} className="btn-ghost border text-xs">
              Vérifier
            </button>
            {domaineTeste && (
              <button
                type="button"
                onClick={() => {
                  setDomaineSaisi("");
                  charger("");
                }}
                className="btn-ghost text-xs"
              >
                Revenir au domaine configuré
              </button>
            )}
          </form>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400">
              Vérifié le {new Date(data.verifie_le).toLocaleString("fr-FR")}
              {data.serveur?.demarre_le && (
                <>
                  {" · API démarrée le "}
                  {new Date(data.serveur.demarre_le).toLocaleString("fr-FR")}
                  {data.serveur.commit ? ` (${data.serveur.commit})` : ""}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => charger(domaineTeste)}
              disabled={chargement}
              className="btn-ghost border text-xs"
            >
              {chargement ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Revérifier
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
