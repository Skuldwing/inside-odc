import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
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

/**
 * Les enregistrements qu'il reste a creer, noms deja calcules pour le domaine.
 *
 * Le panneau se contentait de renvoyer vers Brevo. Or recopier un nom
 * d'enregistrement de tete — « brevo._domainkey. » suivi du domaine — est
 * exactement la ou l'on se trompe, et une faute de frappe dans une zone DNS ne
 * se voit pas : elle se traduit par un domaine qui reste non authentifie sans
 * que rien n'indique pourquoi.
 *
 * Seules deux valeurs ne peuvent pas etre calculees ici : la cle DKIM et le
 * code de verification, propres au compte Brevo.
 */
/* Chaque service publie son authentification a sa facon : Brevo delegue DKIM
   par deux CNAME et ne demande plus d'include SPF ; Mailjet demande l'inverse,
   une cle DKIM en TXT et son include dans le SPF. */
const AUTHENTIFICATION = {
  brevo: { ou: "Brevo, dans Expéditeurs & IP → Domaines" },
  mailjet: {
    spfInclude: "include:spf.mailjet.com",
    selecteurDkim: "mailjet",
    ou: "Mailjet, dans Expéditeurs et domaines",
  },
  smtp: { spfInclude: "include:spf.brevo.com", selecteurDkim: "brevo", ou: "votre service d'envoi" },
};

function enregistrementsAPoser(domaine, controles, adresseRapports, fournisseur) {
  if (!domaine) return [];
  const manque = (cle) => controles[cle] && controles[cle].statut !== "ok";
  const brevo = fournisseur === "brevo";
  const mode = AUTHENTIFICATION[fournisseur] || AUTHENTIFICATION.smtp;
  const liste = [];

  /* Avec Brevo, on ne propose jamais de toucher au SPF : ses messages partent
     avec un Return-Path à lui, et c'est DKIM qui porte l'alignement. Envoyer
     modifier un SPF en service pour rien serait un risque, pas une aide. */
  if (!brevo && manque("spf")) {
    const existant = controles.spf?.valeur;
    liste.push({
      type: "TXT",
      role: "SPF — qui a le droit d'envoyer",
      nom: domaine,
      /* Un domaine ne peut publier qu'un seul SPF : s'il en existe deja un, on
         propose la version fusionnee plutot qu'un second enregistrement, qui
         invaliderait les deux. */
      valeur: existant
        ? existant.replace(/\s*([~\-?+]all)\s*$/, ` ${mode.spfInclude} $1`)
        : `v=spf1 ${mode.spfInclude} ~all`,
      note: existant
        ? "Un SPF existe déjà sur ce domaine : modifiez-le, n'en créez pas un second."
        : null,
    });
  }

  if (manque("dkim")) {
    if (brevo) {
      /* Brevo délègue la signature par deux CNAME plutôt qu'une clé en clair :
         il peut ainsi renouveler ses clés sans rien redemander. */
      for (const n of [1, 2]) {
        liste.push({
          type: "CNAME",
          role: `DKIM ${n} — signature des messages`,
          nom: `brevo${n}._domainkey.${domaine}`,
          valeur: null,
          source: mode.ou,
          note: n === 1 ? "Deux enregistrements, et de type CNAME — pas TXT." : null,
        });
      }
    } else {
      liste.push({
        type: "TXT",
        role: "DKIM — signature des messages",
        nom: `${mode.selecteurDkim}._domainkey.${domaine}`,
        valeur: null,
        source: mode.ou,
      });
    }
  }

  if (manque("verification_brevo")) {
    liste.push({
      type: "TXT",
      role: "Vérification du domaine chez Brevo",
      nom: domaine,
      valeur: null,
      source: AUTHENTIFICATION.brevo.ou,
    });
  }

  if (manque("dmarc")) {
    liste.push({
      type: "TXT",
      role: "DMARC — que faire en cas d'échec",
      nom: `_dmarc.${domaine}`,
      valeur: `v=DMARC1; p=none;${adresseRapports ? ` rua=mailto:${adresseRapports};` : ""}`,
      note: "« p=none » n'impose aucun rejet : il satisfait l'exigence de Gmail tout en laissant observer le trafic avant de durcir.",
    });
  }

  return liste;
}

/* Recopier un enregistrement DNS a la main est le moment ou la faute de frappe
   arrive. Le presse-papiers peut etre refuse selon le contexte : l'echec est
   silencieux, le texte reste selectionnable. */
function BoutonCopier({ valeur }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(valeur);
          setCopie(true);
          setTimeout(() => setCopie(false), 1500);
        } catch {
          /* rien : la valeur reste affichée et sélectionnable */
        }
      }}
      className="flex-shrink-0 text-slate-400 hover:text-slate-700"
      title="Copier"
    >
      {copie ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
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

  /* Essayer un serveur d'envoi demandait jusqu'ici de changer les variables de
     l'hébergement et d'attendre un redémarrage à chaque tentative — plusieurs
     minutes pour une question à laquelle une connexion TCP répond en six
     secondes. */
  const [sondeHote, setSondeHote] = useState("");
  const [sondePort, setSondePort] = useState(587);
  const [sondeEnCours, setSondeEnCours] = useState(false);
  const [sondeResultat, setSondeResultat] = useState(null);

  const sonder = async () => {
    setSondeEnCours(true);
    setSondeResultat(null);
    try {
      const res = await api.post("/email/sonde-smtp", {
        hote: sondeHote.trim(),
        port: Number(sondePort),
      });
      setSondeResultat(res.data.sonde);
    } catch (err) {
      setSondeResultat({ erreur: err?.response?.data?.error || "La sonde n'a pas abouti." });
    } finally {
      setSondeEnCours(false);
    }
  };

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
  /* Les rapports DMARC vont vers une adresse relevée par un humain. L'adresse
     d'expédition d'un domaine neuf n'a le plus souvent aucune boîte derrière :
     les rapports y seraient perdus. L'adresse de réponse, elle, en a une. */
  const aPoser = enregistrementsAPoser(
    data.domaine,
    controles,
    data.configuration?.repondre_a || data.configuration?.expediteur,
    data.fournisseur || data.configuration?.fournisseur
  );
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

          {aPoser.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-700">
              <p className="font-medium text-slate-800">
                Ces {aPoser.length} enregistrement{aPoser.length > 1 ? "s" : ""} restent à créer dans le DNS
              </p>
              <p className="mt-1">
                Chez votre hébergeur de domaine, rubrique <em>Zone DNS</em>. Les noms ci-dessous sont
                déjà calculés pour {data.domaine}.
              </p>

              <ul className="mt-3 space-y-2">
                {aPoser.map((e) => (
                  <li key={e.nom + e.role} className="rounded-lg border border-slate-200 bg-white p-2.5">
                    <p className="font-medium text-slate-800">{e.role}</p>
                    <dl className="mt-1.5 space-y-1">
                      <div className="flex gap-2">
                        <dt className="w-14 flex-shrink-0 text-slate-500">Type</dt>
                        <dd className="font-mono">{e.type}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-14 flex-shrink-0 text-slate-500">Nom</dt>
                        <dd className="min-w-0 flex-1 break-all font-mono">{e.nom}</dd>
                        <BoutonCopier valeur={e.nom} />
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-14 flex-shrink-0 text-slate-500">Valeur</dt>
                        {e.valeur ? (
                          <>
                            <dd className="min-w-0 flex-1 break-all font-mono">{e.valeur}</dd>
                            <BoutonCopier valeur={e.valeur} />
                          </>
                        ) : (
                          <dd className="min-w-0 flex-1 italic text-slate-500">
                            fournie par {e.source}
                          </dd>
                        )}
                      </div>
                    </dl>
                    {e.note && <p className="mt-1.5 text-slate-600">{e.note}</p>}
                  </li>
                ))}
              </ul>

              <p className="mt-2.5">
                Revenez ensuite ici et cliquez sur <em>Revérifier</em> : la propagation prend de
                quelques minutes à quelques heures.
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
                    {/* Quand la connexion n'aboutit pas, savoir à quelle étape
                        elle s'arrête vaut mieux que le motif seul. */}
                    {essai.sonde?.etapes?.length > 0 && (
                      <ul className="mt-2 space-y-1.5 border-t border-red-200 pt-2">
                        {essai.sonde.etapes.map((e) => (
                          <li key={e.nom} className="flex items-start gap-2">
                            {e.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden="true" />
                            ) : (
                              <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" aria-hidden="true" />
                            )}
                            <span className="min-w-0">
                              <span className="font-medium">{e.nom}</span>
                              {e.detail ? <span className="opacity-80"> — {e.detail}</span> : null}
                              {e.remede ? <span className="mt-0.5 block opacity-90">{e.remede}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {essai.brut && (
                      <p className="mt-2 break-all font-mono text-[11px] opacity-70">{essai.brut}</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Tester un serveur d'envoi sans rien déployer. Rien n'est envoyé,
              rien n'est authentifié : on ouvre une connexion et on écoute. */}
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[11rem] flex-1 text-xs text-slate-600">
                Tester un serveur d&apos;envoi
                <input
                  type="text"
                  value={sondeHote}
                  onChange={(e) => setSondeHote(e.target.value)}
                  placeholder="ssl0.ovh.net"
                  className="input mt-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Port
                <select
                  value={sondePort}
                  onChange={(e) => setSondePort(Number(e.target.value))}
                  className="input mt-1 w-24 text-sm"
                >
                  {[587, 465, 2525, 25].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={sonder}
                disabled={sondeEnCours || !sondeHote.trim()}
                className="btn-ghost border text-xs"
              >
                {sondeEnCours ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Sonder
              </button>
            </div>

            {sondeResultat && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                {sondeResultat.erreur ? (
                  <p className="text-red-700">{sondeResultat.erreur}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {sondeResultat.etapes.map((e) => (
                      <li key={e.nom} className="flex items-start gap-2">
                        {e.ok ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <XCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" aria-hidden="true" />
                        )}
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800">{e.nom}</span>
                          {e.detail ? <span className="text-slate-600"> — {e.detail}</span> : null}
                          {e.remede ? <span className="mt-0.5 block text-slate-600">{e.remede}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
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
