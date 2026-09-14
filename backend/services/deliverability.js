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

async function cname(nom) {
  try {
    return await avecDelai(dns.resolveCname(nom), nom);
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

/* Un SPF ne se juge pas dans l'absolu : il doit autoriser le service qui
   envoie reellement. Un domaine Microsoft 365 parfaitement configure n'a
   aucune raison d'autoriser Brevo, et inversement. */
const EXPEDITEURS = {
  brevo: {
    nom: "Brevo",
    motif: /include:spf\.brevo\.com|include:sendinblue\.com/i,
    remede: "Ajoutez « include:spf.brevo.com » avant le « ~all ».",
  },
  smtp: {
    nom: "Microsoft 365",
    motif: /include:spf\.protection\.outlook\.com/i,
    remede:
      "Si l'envoi passe par Exchange Online, le domaine doit inclure « include:spf.protection.outlook.com ».",
  },
};

/**
 * @param dkimAligne  DKIM signe-t-il deja au nom du domaine ?
 *
 * Brevo ne demande plus d'include SPF : ses messages partent avec un
 * Return-Path sur un domaine a lui, et c'est la signature DKIM — posee par les
 * deux CNAME brevo1/brevo2 — qui porte l'alignement avec le domaine. Gmail et
 * Yahoo exigent que SPF *ou* DKIM passe et soit aligne : DKIM suffit.
 *
 * Reclamer malgre tout « include:spf.brevo.com » enverrait l'administrateur
 * modifier un SPF qui fonctionne, pour rien — et toucher a un SPF en service
 * est un risque, pas une precaution.
 */
function verdictSpf(enregistrements, fournisseur, dkimAligne = false) {
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

  const attendu = EXPEDITEURS[fournisseur];
  if (!attendu) {
    return {
      statut: "attention",
      valeur: spf,
      detail:
        "SPF present. Aucun service d'envoi n'etant configure, impossible de dire s'il autorise le bon expediteur.",
    };
  }

  const autorise = attendu.motif.test(spf);
  if (autorise) {
    return { statut: "ok", valeur: spf, detail: `SPF present et autorisant ${attendu.nom}.` };
  }

  if (fournisseur === "brevo" && dkimAligne) {
    return {
      statut: "ok",
      valeur: spf,
      detail:
        "SPF present. Il n'autorise pas Brevo, et c'est normal : Brevo signe les messages en DKIM au nom du domaine, ce qui suffit a l'alignement exige par Gmail et Yahoo. Ne modifiez pas ce SPF.",
    };
  }

  return {
    statut: "attention",
    valeur: spf,
    detail: `SPF present, mais il n'autorise pas ${attendu.nom}. ${attendu.remede}`,
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

/**
 * DKIM se publie de deux facons, et ne chercher que la premiere revient a
 * declarer absente une configuration parfaitement en place.
 *
 * Historiquement la cle etait un TXT sous le selecteur. Brevo delegue
 * desormais par deux CNAME — brevo1._domainkey et brevo2._domainkey — pointant
 * vers ses propres serveurs, ce qui lui permet de faire tourner ses cles sans
 * rien demander a personne. Un premier jet ne connaissait que le selecteur
 * « brevo » en TXT : il annoncait « aucune cle publiee » sur un domaine
 * correctement authentifie, et envoyait corriger une panne inexistante.
 */
function verdictDkim(txtParSelecteur, cnameParSelecteur) {
  const enTxt = Object.entries(txtParSelecteur).find(([, v]) => Array.isArray(v) && v.length);
  const enCname = Object.entries(cnameParSelecteur).find(([, v]) => Array.isArray(v) && v.length);

  if (!enTxt && !enCname) {
    return {
      statut: "manquant",
      detail:
        "Aucune cle DKIM publiee. Sans signature, un message ne peut pas prouver son origine : c'est le point que Brevo signale.",
    };
  }

  if (enCname) {
    const selecteurs = Object.entries(cnameParSelecteur)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([s]) => s);
    return {
      statut: "ok",
      valeur: selecteurs.map((s) => `${s}._domainkey → ${cnameParSelecteur[s][0]}`).join(", "),
      detail: `Signature DKIM deleguee au service d'envoi (${selecteurs.length} enregistrement${
        selecteurs.length > 1 ? "s" : ""
      } CNAME).`,
    };
  }

  return {
    statut: "ok",
    valeur: `selecteur « ${enTxt[0]} »`,
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

/* Selecteurs DKIM courants. Brevo delegue aujourd'hui par brevo1/brevo2 en
   CNAME ; « brevo » et « mail » restent en TXT sur les comptes plus anciens ;
   Microsoft 365 signe avec selector1/2. */
const SELECTEURS_DKIM = ["brevo", "brevo1", "brevo2", "mail", "selector1", "selector2"];

async function diagnostiquerDomaine(domaine, fournisseur = "brevo") {
  const nbSel = SELECTEURS_DKIM.length;
  const resultats = await Promise.all([
    txt(domaine),
    txt(`_dmarc.${domaine}`),
    mx(domaine),
    ...SELECTEURS_DKIM.map((s) => txt(`${s}._domainkey.${domaine}`)),
    ...SELECTEURS_DKIM.map((s) => cname(`${s}._domainkey.${domaine}`)),
  ]);

  const [txtDomaine, dmarc, mxDomaine] = resultats;
  const dkimsTxt = resultats.slice(3, 3 + nbSel);
  const dkimsCname = resultats.slice(3 + nbSel);

  const parSelecteur = Object.fromEntries(SELECTEURS_DKIM.map((s, i) => [s, dkimsTxt[i]]));
  const parSelecteurCname = Object.fromEntries(SELECTEURS_DKIM.map((s, i) => [s, dkimsCname[i]]));

  /* Brevo demande un TXT « brevo-code:... » pour prouver qu'on possede bien
     le domaine avant d'autoriser l'envoi en son nom. */
  const codeBrevo = Array.isArray(txtDomaine)
    ? txtDomaine.find((v) => v.toLowerCase().startsWith("brevo-code:"))
    : null;

  const dkim = verdictDkim(parSelecteur, parSelecteurCname);
  const controles = {
    spf: verdictSpf(txtDomaine, fournisseur, dkim.statut === "ok"),
    dkim,
    dmarc: verdictDmarc(dmarc),
    reception: verdictMx(mxDomaine),
  };

  /* Le code de verification ne concerne que Brevo : l'exiger d'un domaine qui
     envoie par Exchange Online signalerait une panne la ou tout va bien. */
  if (fournisseur === "brevo") {
    controles.verification_brevo = codeBrevo
      ? { statut: "ok", valeur: codeBrevo, detail: "Le domaine est verifie aupres de Brevo." }
      : {
          statut: "manquant",
          detail:
            "Le code de verification Brevo n'est pas publie. Brevo le fournit dans Expediteurs & IP, onglet Domaines.",
        };
  }

  return { domaine, fournisseur, verifie_le: new Date().toISOString(), controles };
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
  /* Le cas qui a fait perdre le plus de temps : la cle Brevo est en place, mais
     MAIL_PROVIDER pointe encore sur SMTP, et les envois continuent de buter sur
     un port que l'hebergeur ferme. Rien ne le signalait. */
  /* Se voit avant le premier envoi plutot qu'apres deux cents echecs. */
  if (fournisseur === "brevo") {
    const cle = String(process.env.BREVO_API_KEY || "").trim();
    if (cle.startsWith("xsmtpsib-")) {
      alertes.push(
        "BREVO_API_KEY contient le mot de passe SMTP de Brevo (« xsmtpsib- »), pas la cle d'API. Brevo refusera chaque envoi. La cle d'API commence par « xkeysib- » et se cree dans SMTP & API, onglet Cles d'API."
      );
    } else if (cle && !cle.startsWith("xkeysib-")) {
      alertes.push(
        "BREVO_API_KEY ne ressemble pas a une cle d'API Brevo : celles-ci commencent par « xkeysib- ». Verifiez que la valeur collee est bien la cle d'API, et qu'aucune espace ne s'y est glissee."
      );
    }
  }

  if (fournisseur === "smtp" && brevoConfigure) {
    alertes.push(
      "Une cle Brevo est presente mais inutilisee : l'envoi passe par SMTP. Si le port SMTP est bloque par l'hebergeur, basculez MAIL_PROVIDER sur « brevo » — Brevo envoie en HTTPS."
    );
  }

  return {
    expediteur: from,
    nom_expediteur: process.env.MAIL_FROM_NAME || null,
    repondre_a: process.env.MAIL_REPLY_TO || null,
    fournisseur,
    fournisseur_force: choix || null,
    brevo_configure: brevoConfigure,
    smtp_configure: smtpConfigure,
    smtp_hote: smtpHost,
    smtp_compte: smtpUser,
    alertes,
  };
}

/**
 * Traduction des refus du serveur d'envoi.
 *
 * « Erreur lors de l'envoi » ne dit rien. Or les messages bruts, eux, disent
 * presque toujours exactement quoi corriger — encore faut-il les avoir lus une
 * fois. Chaque motif ci-dessous correspond a un refus reellement rencontre
 * chez Exchange Online ou Brevo, avec la manoeuvre correspondante.
 */
const CAUSES = [
  {
    /* A placer avant le 401 generique : Brevo rend « unauthorized » dans les
       deux cas, et l'ordre de la table decide du verdict. Un premier jet
       concluait « cle inconnue » sur une cle parfaitement valide, refusee pour
       une tout autre raison — c'est le message brut, conserve a cote, qui a
       revele l'erreur. */
    motif: /unrecognised IP address|unrecognized IP address|authorised_ips/i,
    cause: "Brevo bloque l'adresse IP du serveur. La cle, elle, est valide.",
    remede: (texte) => {
      const ip = (texte.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/) || [])[1];
      return (
        `Autorisez ${ip ? `l'adresse ${ip}` : "l'adresse de sortie du serveur"} dans Brevo, ` +
        "page Securite → Adresses IP autorisees (app.brevo.com/security/authorised_ips). " +
        "Attention : l'adresse de sortie d'un hebergement mutualise change sans prevenir, " +
        "et le blocage reviendra alors. Si cela se reproduit, desactivez la restriction par IP " +
        "plutot que d'ajouter chaque nouvelle adresse."
      );
    },
  },
  {
    motif: /535 5\.7\.139|basic authentication is disabled|SmtpClientAuthentication is disabled/i,
    cause: "Microsoft 365 refuse l'authentification simple sur ce compte.",
    remede:
      "La DSI doit activer « SMTP AUTH (Authenticated SMTP) » sur cette boite. C'est un reglage par boite, desactive par defaut depuis 2020.",
  },
  {
    motif: /535 5\.7\.3|authentication unsuccessful|invalid login|EAUTH/i,
    cause: "Le compte ou le mot de passe est refuse.",
    remede:
      "Verifiez SMTP_USER et SMTP_PASS. Si l'authentification multifacteur est active sur le compte, un mot de passe ordinaire ne passe pas : il faut un mot de passe d'application.",
  },
  {
    motif: /5\.7\.60|does not have permissions to send as|SendAsDenied/i,
    cause: "Le compte n'a pas le droit d'envoyer au nom de l'adresse annoncee.",
    remede:
      "MAIL_FROM doit etre l'adresse du compte lui-meme (SMTP_USER), ou une adresse sur laquelle ce compte a recu un droit « Envoyer en tant que ».",
  },
  {
    motif: /ENOTFOUND|EAI_AGAIN/i,
    cause: "Le serveur d'envoi est introuvable.",
    remede: "Verifiez SMTP_HOST — pour Microsoft 365 c'est « smtp.office365.com ».",
  },
  {
    /* Nodemailer n'ecrit pas le code dans son message : « Connection timeout »
       et « Greeting never received » sont ses propres formulations, et le code
       ETIMEDOUT ne vit que sur l'objet d'erreur. Les deux sont reconnus ici. */
    motif: /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ESOCKET|Connection timeout|Greeting never received/i,
    cause: "La connexion au serveur d'envoi n'aboutit jamais.",
    remede:
      "Le port sortant est presque toujours en cause : beaucoup d'hebergeurs bloquent le trafic SMTP. Verifiez SMTP_PORT (587 pour Microsoft 365) et SMTP_SECURE (false sur le 587). Si le port est bloque par l'hebergeur, aucun reglage ne le debloquera : il faut passer par un service qui envoie en HTTPS.",
  },
  {
    motif: /Brevo error 401|Key not found|unauthorized|invalid api key/i,
    cause: "Brevo ne reconnait pas la cle (« Key not found »).",
    /* Brevo delivre deux identifiants d'apparence tres proche, sur la meme
       page : la cle d'API (xkeysib-) et le mot de passe SMTP (xsmtpsib-).
       Seule la premiere fonctionne avec l'API HTTPS ; la seconde donne
       exactement cette erreur. C'est la confusion la plus frequente. */
    remede:
      "Verifiez que BREVO_API_KEY commence par « xkeysib- ». Une valeur commencant par « xsmtpsib- » est le mot de passe SMTP, pas la cle d'API : Brevo les presente cote a cote et ils se confondent facilement. La cle d'API se cree dans Brevo, SMTP & API → onglet Cles d'API.",
  },
  {
    motif: /sender.*not.*valid|Sender not found|unrecognised sender/i,
    cause: "Brevo ne reconnait pas l'adresse d'expedition.",
    remede:
      "L'adresse de MAIL_FROM doit etre declaree et validee dans Brevo, Expediteurs & IP.",
  },
  {
    motif: /quota|rate limit|too many|throttl/i,
    cause: "Le service d'envoi limite le debit.",
    remede: "Baissez MAIL_DEBIT_PAR_MINUTE, ou attendez la fin de la periode de limitation.",
  },
];

function interpreterErreurEnvoi(message) {
  const texte = String(message || "");
  const trouve = CAUSES.find((c) => c.motif.test(texte));
  /* Certains remedes dependent du message : l'adresse IP a autoriser n'a de
     sens que recopiee telle quelle. */
  if (trouve) {
    return {
      cause: trouve.cause,
      remede: typeof trouve.remede === "function" ? trouve.remede(texte) : trouve.remede,
    };
  }
  return {
    cause: "Le service d'envoi a refuse le message.",
    remede: "Le message brut ci-dessous vient du serveur d'envoi : il indique en general la manoeuvre exacte.",
  };
}

module.exports = { diagnostiquerDomaine, configurationEnvoi, interpreterErreurEnvoi };
