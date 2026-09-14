const dns = require("dns").promises;

/**
 * Diagnostic de delivrabilite du domaine expediteur.
 *
 * Depuis fevrier 2024, Gmail, Yahoo et Microsoft refusent — ou classent en
 * indesirable — les messages dont le domaine d'expedition n'est pas
 * authentifie. Trois enregistrements DNS sont en jeu :
 *
 *   SPF    dit quels serveurs ont le droit d'envoyer pour le domaine
 *   DKIM   signe chaque message, ce qui prouve qu'il n'a pas ete falsifie
 *   DMARC  dit au destinataire quoi faire quand SPF et DKIM echouent
 *
 * Aucun code ne remplace ces enregistrements : ils vivent dans la zone DNS du
 * domaine. Cette page sert a voir ce qui est en place, ce qui manque, et a
 * verifier apres coup que la demande faite a l'hebergeur DNS a bien abouti.
 */

const TIMEOUT_MS = 5000;

/* Node n'expose pas de delai par requete DNS : sans cela, un serveur qui ne
   repond pas fait attendre la page entiere. */
function avecDelai(promesse, etiquette) {
  return Promise.race([
    promesse,
    new Promise((_, rejeter) =>
      setTimeout(() => rejeter(Object.assign(new Error(etiquette), { code: "ETIMEOUT" })), TIMEOUT_MS)
    ),
  ]);
}

async function txt(nom) {
  try {
    const enregistrements = await avecDelai(dns.resolveTxt(nom), nom);
    return enregistrements.map((parties) => parties.join(""));
  } catch (err) {
    return { erreur: err.code || "ERREUR" };
  }
}

async function mx(nom) {
  try {
    return await avecDelai(dns.resolveMx(nom), nom);
  } catch (err) {
    return { erreur: err.code || "ERREUR" };
  }
}

const introuvable = (r) => !Array.isArray(r);

function verdictSpf(enregistrements) {
  if (introuvable(enregistrements)) {
    return {
      statut: "manquant",
      detail: "Aucun enregistrement TXT lisible sur le domaine.",
    };
  }
  const spf = enregistrements.find((v) => v.toLowerCase().startsWith("v=spf1"));
  if (!spf) {
    return {
      statut: "manquant",
      detail:
        "Aucun enregistrement SPF. Les serveurs destinataires n'ont aucun moyen de savoir qui a le droit d'envoyer pour ce domaine.",
    };
  }
  const brevo = /include:spf\.brevo\.com|include:sendinblue\.com/i.test(spf);
  return {
    statut: brevo ? "ok" : "attention",
    valeur: spf,
    detail: brevo
      ? "SPF present et autorisant Brevo."
      : "SPF present, mais il n'autorise pas Brevo. Ajoutez « include:spf.brevo.com » avant le « ~all ».",
  };
}

function verdictDmarc(enregistrements) {
  if (introuvable(enregistrements)) {
    return {
      statut: "manquant",
      detail:
        "Aucun enregistrement DMARC. Gmail et Yahoo l'exigent depuis fevrier 2024, meme avec une politique permissive.",
    };
  }
  const dmarc = enregistrements.find((v) => v.toLowerCase().startsWith("v=dmarc1"));
  if (!dmarc) return { statut: "manquant", detail: "Aucun enregistrement DMARC valide." };
  const politique = (dmarc.match(/p=([a-z]+)/i) || [])[1] || "none";
  return {
    statut: "ok",
    valeur: dmarc,
    detail: `DMARC present, politique « ${politique} ».`,
  };
}

function verdictDkim(resultats) {
  const trouve = Object.entries(resultats).find(([, v]) => Array.isArray(v) && v.length);
  if (!trouve) {
    return {
      statut: "manquant",
      detail:
        "Aucune cle DKIM publiee. Sans signature, un message ne peut pas prouver son origine : c'est le point que Brevo signale.",
    };
  }
  return {
    statut: "ok",
    valeur: `selecteur « ${trouve[0]} »`,
    detail: "Une cle DKIM est publiee pour ce domaine.",
  };
}

function verdictMx(enregistrements) {
  if (introuvable(enregistrements) || !enregistrements.length) {
    return {
      statut: "attention",
      detail:
        "Aucun serveur de reception. Le domaine peut servir a envoyer, mais aucune reponse ne pourra y arriver — et une adresse qui ne recoit pas nuit a la reputation d'expedition.",
    };
  }
  return {
    statut: "ok",
    valeur: enregistrements.map((m) => m.exchange).join(", "),
    detail: "Le domaine recoit du courrier.",
  };
}

/* Selecteurs DKIM courants. Brevo utilise « brevo » aujourd'hui et « mail »
   pour les comptes plus anciens ; Microsoft 365 signe avec selector1/2. */
const SELECTEURS_DKIM = ["brevo", "mail", "selector1", "selector2"];

async function diagnostiquerDomaine(domaine) {
  const [txtDomaine, dmarc, mxDomaine, ...dkims] = await Promise.all([
    txt(domaine),
    txt(`_dmarc.${domaine}`),
    mx(domaine),
    ...SELECTEURS_DKIM.map((s) => txt(`${s}._domainkey.${domaine}`)),
  ]);

  const parSelecteur = Object.fromEntries(SELECTEURS_DKIM.map((s, i) => [s, dkims[i]]));

  /* Brevo demande un TXT « brevo-code:... » pour prouver qu'on possede bien
     le domaine avant d'autoriser l'envoi en son nom. */
  const codeBrevo = Array.isArray(txtDomaine)
    ? txtDomaine.find((v) => v.toLowerCase().startsWith("brevo-code:"))
    : null;

  return {
    domaine,
    verifie_le: new Date().toISOString(),
    controles: {
      spf: verdictSpf(txtDomaine),
      dkim: verdictDkim(parSelecteur),
      dmarc: verdictDmarc(dmarc),
      verification_brevo: codeBrevo
        ? { statut: "ok", valeur: codeBrevo, detail: "Le domaine est verifie aupres de Brevo." }
        : {
            statut: "manquant",
            detail:
              "Le code de verification Brevo n'est pas publie. Brevo le fournit dans Expediteurs & IP, onglet Domaines.",
          },
      reception: verdictMx(mxDomaine),
    },
  };
}

/* Configuration effective du serveur. On n'expose ni cle d'API ni mot de
   passe : uniquement de quoi comprendre qui envoie, et au nom de qui. */
function configurationEnvoi() {
  const from = process.env.MAIL_FROM || null;
  const smtpUser = process.env.SMTP_USER || null;
  const smtpHost = process.env.SMTP_HOST || null;
  const brevoConfigure = Boolean(process.env.BREVO_API_KEY);
  const smtpConfigure = Boolean(smtpHost && smtpUser && process.env.SMTP_PASS);

  const choix = (process.env.MAIL_PROVIDER || "").toLowerCase();
  let fournisseur;
  if (choix === "brevo") fournisseur = brevoConfigure ? "brevo" : "aucun";
  else if (choix === "smtp") fournisseur = smtpConfigure ? "smtp" : "aucun";
  else if (brevoConfigure) fournisseur = "brevo";
  else if (smtpConfigure) fournisseur = "smtp";
  else fournisseur = "aucun";

  const domaineDe = (adresse) => (adresse && adresse.includes("@") ? adresse.split("@")[1].toLowerCase() : null);
  const domaineFrom = domaineDe(from);
  const domaineSmtp = domaineDe(smtpUser);

  const alertes = [];
  if (fournisseur === "aucun") {
    alertes.push(
      "Aucun service d'envoi n'est configure : les emails sont ignores silencieusement."
    );
  }
  if (fournisseur === "smtp" && domaineFrom && domaineSmtp && domaineFrom !== domaineSmtp) {
    alertes.push(
      `Les messages partent du compte ${smtpUser} mais s'annoncent comme venant de ${from}. ` +
        "Pour un serveur destinataire, c'est une usurpation : ni SPF ni DKIM ne peuvent s'aligner, " +
        "et le message est rejete ou classe en indesirable."
    );
  }
  if (!choix && brevoConfigure && smtpConfigure) {
    alertes.push(
      "Brevo et SMTP sont tous deux configures. Fixez MAIL_PROVIDER pour lever l'ambiguite."
    );
  }

  return {
    expediteur: from,
    nom_expediteur: process.env.MAIL_FROM_NAME || null,
    fournisseur,
    fournisseur_force: choix || null,
    brevo_configure: brevoConfigure,
    smtp_configure: smtpConfigure,
    smtp_hote: smtpHost,
    smtp_compte: smtpUser,
    alertes,
  };
}

module.exports = { diagnostiquerDomaine, configurationEnvoi };
