/* Un copier-coller dans une interface d'hebergeur ramene volontiers une
   espace ou un retour a la ligne. Invisible a l'oeil, mais la cle part alors
   avec, et le service repond « cle inconnue » sur une cle pourtant juste. */
const propre = (v) => (typeof v === "string" ? v.trim() : v);

const BREVO_API_KEY = propre(process.env.BREVO_API_KEY);
/* Mailjet authentifie par un couple : cle publique et cle privee, en Basic
   HTTP. Les deux sont indispensables — une seule ne sert a rien. */
const MAILJET_API_KEY = propre(process.env.MAILJET_API_KEY);
const MAILJET_API_SECRET = propre(process.env.MAILJET_API_SECRET);
const MAIL_FROM = propre(process.env.MAIL_FROM);
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Inside ODC";
/* L'adresse d'expedition doit appartenir au domaine qui authentifie l'envoi :
   elle n'est donc pas libre. L'adresse de reponse, elle, l'est. C'est ce qui
   permet d'envoyer depuis une boite institutionnelle tout en recevant les
   reponses sur une adresse personnelle. */
const MAIL_REPLY_TO = propre(process.env.MAIL_REPLY_TO) || null;
const SMTP_HOST = propre(process.env.SMTP_HOST);
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = propre(process.env.SMTP_USER);
const SMTP_PASS = propre(process.env.SMTP_PASS);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";

/* Quel service envoie reellement.
   Auparavant SMTP l'emportait des qu'il etait configure, sans que rien ne
   l'indique : une cle Brevo pouvait etre en place et ne jamais servir. Pire,
   on envoyait par un compte @orange-sonatel.com en signant
   @orangedigitalcenter.sn — deux domaines differents, donc ni SPF ni DKIM
   alignes, donc rejet par Gmail depuis le durcissement de fevrier 2024.
   MAIL_PROVIDER tranche explicitement ; a defaut, Brevo prime, car c'est le
   service prevu pour l'envoi en nombre. */
const PROVIDER = String(process.env.MAIL_PROVIDER || "").toLowerCase();
const brevoPret = Boolean(BREVO_API_KEY && MAIL_FROM);
const mailjetPret = Boolean(MAILJET_API_KEY && MAILJET_API_SECRET && MAIL_FROM);
const smtpPret = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM);

function fournisseurRetenu() {
  if (PROVIDER === "brevo") return brevoPret ? "brevo" : "aucun";
  if (PROVIDER === "mailjet") return mailjetPret ? "mailjet" : "aucun";
  if (PROVIDER === "smtp") return smtpPret ? "smtp" : "aucun";
  /* A defaut de choix explicite, les services en HTTPS priment : l'hebergement
     ferme le port SMTP sortant, un repli sur SMTP n'enverrait rien. */
  if (brevoPret) return "brevo";
  if (mailjetPret) return "mailjet";
  if (smtpPret) return "smtp";
  return "aucun";
}

/* Averti une seule fois au demarrage plutot qu'a chaque envoi : une alerte
   repetee a chaque message finit par ne plus etre lue. */
let alerteAlignementEmise = false;
function verifierAlignement() {
  if (alerteAlignementEmise) return;
  alerteAlignementEmise = true;
  const domaine = (a) => (a && a.includes("@") ? a.split("@")[1].toLowerCase() : null);
  const dFrom = domaine(MAIL_FROM);
  const dSmtp = domaine(SMTP_USER);
  if (dFrom && dSmtp && dFrom !== dSmtp) {
    console.warn(
      `[MAIL] Expedition par ${SMTP_USER} en se presentant comme ${MAIL_FROM}. ` +
        "Les domaines different : SPF et DKIM ne peuvent pas s'aligner, les messages " +
        "seront rejetes ou classes en indesirable. Envoyez depuis le domaine du compte, " +
        "ou passez par Brevo avec un domaine authentifie."
    );
  }
}

/* ===== QUAND LA CONNEXION N'ABOUTIT PAS =====
 *
 * Distinguer « le serveur a refuse » de « on n'a jamais pu lui parler ».
 *
 * Un refus — mot de passe faux, expediteur non autorise, destinataire rejete —
 * est un probleme de configuration : il faut le corriger, pas le contourner.
 * Basculer ailleurs ne ferait que masquer une faute qui reviendra.
 *
 * Une connexion qui n'aboutit pas, elle, ne dit rien de la configuration : le
 * port est ferme, le reseau coupe, l'hote injoignable. Aucun reglage de la
 * plateforme n'y changera quoi que ce soit, et c'est la qu'un autre chemin a
 * du sens.
 */
const CONNEXION_IMPOSSIBLE =
  /ETIMEDOUT|ECONNREFUSED|ECONNRESET|ESOCKET|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|Greeting never received|Connection timeout/i;

function connexionImpossible(err) {
  /* Nodemailer range l'essentiel hors du message : « Connection timeout » ne
     porte pas son code ETIMEDOUT. On regarde les trois. */
  return CONNEXION_IMPOSSIBLE.test(
    [err?.code, err?.message, err?.command].filter(Boolean).join(" ")
  );
}

let basculeExpliquee = false;

async function sendEmail({ toEmail, toName, subject, html, text, attachments = [], bcc = [], cc = [], headers = {}, replyTo = null }) {
  const fournisseur = fournisseurRetenu();
  const repondreA = replyTo || MAIL_REPLY_TO;
  const enveloppe = { toEmail, toName, subject, html, text, attachments, bcc, cc, headers, repondreA };

  if (fournisseur === "smtp") {
    verifierAlignement();
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      /* Sans ces bornes, nodemailer attend deux minutes avant d'abandonner une
         connexion qui n'aboutira jamais — le cas exact d'un port SMTP bloque
         par l'hebergeur. Une campagne de cent personnes y passerait plus de
         trois heures a ne rien envoyer, et le bouton d'essai resterait muet si
         longtemps qu'on le croirait casse. Quinze secondes suffisent
         largement a un serveur qui repond. */
      connectionTimeout: Number(process.env.SMTP_TIMEOUT_MS || 15000),
      greetingTimeout: 10000,
      socketTimeout: 30000,
    });

    const formatAddr = (r) => r.name ? `"${r.name}" <${r.email}>` : r.email;
    try {
      await transporter.sendMail({
        from: `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
        to: toName ? `"${toName}" <${toEmail}>` : toEmail,
        replyTo: repondreA || undefined,
        bcc: bcc.length ? bcc.map(formatAddr).join(", ") : undefined,
        cc:  cc.length  ? cc.map(formatAddr).join(", ")  : undefined,
        subject,
        html,
        text,
        attachments,
        headers,
      });
      return "smtp";
    } catch (err) {
      /* Le port sortant est ferme et une cle Brevo est la : on passe par
         l'API plutot que de perdre le message.

         Ce n'est pas un contournement de confort. Sur cet hebergement, le
         port 587 ne s'ouvrira pas : tant que MAIL_PROVIDER vaut « smtp »,
         plus rien ne part, et Brevo ne voit aucun appel — donc il n'envoie
         pas non plus l'alerte qui permettrait de comprendre. Le reglage
         propre reste de pointer MAIL_PROVIDER sur « brevo » ; en attendant,
         les messages arrivent. */
      if (!brevoPret || !connexionImpossible(err)) throw err;

      if (!basculeExpliquee) {
        basculeExpliquee = true;
        console.warn(
          `[MAIL] ${SMTP_HOST}:${SMTP_PORT} injoignable (${err.code || err.message}). ` +
            "Repli sur l'API Brevo, qui envoie en HTTPS. Les messages partent, mais " +
            "le reglage reste a corriger : passez MAIL_PROVIDER a « brevo » pour " +
            "eviter d'attendre l'echec SMTP avant chaque envoi."
        );
      } else {
        console.warn("[MAIL] SMTP injoignable, repli sur Brevo.");
      }

      await envoyerParBrevo(enveloppe);
      return "brevo (repli)";
    }
  }

  if (fournisseur === "aucun") {
    console.warn(
      "[MAIL] Aucun service d'envoi configure (MAIL_PROVIDER / BREVO_API_KEY / MAILJET_* / SMTP_*). Message ignore."
    );
    return "aucun";
  }

  if (fournisseur === "mailjet") {
    const destinataires = (liste) => liste.map((r) => ({ Email: r.email, Name: r.name || r.email }));
    const message = {
      From: { Email: MAIL_FROM, Name: MAIL_FROM_NAME },
      To: [{ Email: toEmail, Name: toName || toEmail }],
      Subject: subject,
      TextPart: text,
      HTMLPart: html,
    };
    if (repondreA) message.ReplyTo = { Email: repondreA };
    if (headers && Object.keys(headers).length) message.Headers = headers;
    if (cc.length) message.Cc = destinataires(cc);
    if (bcc.length) message.Bcc = destinataires(bcc);
    if (attachments && attachments.length) {
      message.Attachments = attachments.map((a) => ({
        ContentType: a.contentType || "application/octet-stream",
        Filename: a.filename,
        Base64Content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content,
      }));
    }

    const res = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization:
          "Basic " + Buffer.from(`${MAILJET_API_KEY}:${MAILJET_API_SECRET}`).toString("base64"),
      },
      body: JSON.stringify({ Messages: [message] }),
    });

    const corps = await res.text();
    if (!res.ok) throw new Error(`Mailjet error ${res.status}: ${corps}`);

    /* Mailjet repond 200 meme quand le message est refuse : le verdict est
       dans Messages[].Status. Sans ce controle, un refus passerait pour un
       envoi reussi et le journal de campagne mentirait. */
    let verdict = null;
    try {
      verdict = JSON.parse(corps)?.Messages?.[0];
    } catch {
      /* corps illisible : on ne peut rien affirmer, on laisse passer */
    }
    if (verdict && verdict.Status && verdict.Status !== "success") {
      const motifs = (verdict.Errors || [])
        .map((e) => e.ErrorMessage || e.ErrorCode)
        .filter(Boolean)
        .join(" ; ");
      throw new Error(`Mailjet error ${verdict.Status}: ${motifs || corps}`);
    }
    return "mailjet";
  }

  await envoyerParBrevo(enveloppe);
  return "brevo";
}

/* L'envoi par l'API de Brevo, extrait de « sendEmail » pour servir aussi de
   repli quand le port SMTP sortant est ferme. Un seul chemin de code : ce qui
   part par repli est exactement ce qui serait parti par choix. */
async function envoyerParBrevo({ toEmail, toName, subject, html, text,
                                 attachments = [], bcc = [], cc = [],
                                 headers = {}, repondreA = null }) {
  const payload = {
    sender: { email: MAIL_FROM, name: MAIL_FROM_NAME },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject,
    htmlContent: html,
    textContent: text,
  };

  /* Les en-tetes personnalises portent notamment le desabonnement en un clic,
     exige par Gmail et Yahoo pour les envois en nombre. */
  if (headers && Object.keys(headers).length) payload.headers = headers;

  if (repondreA) payload.replyTo = { email: repondreA };

  if (bcc.length) payload.bcc = bcc.map(r => ({ email: r.email, name: r.name || r.email }));
  if (cc.length)  payload.cc  = cc.map(r => ({ email: r.email, name: r.name || r.email }));

  if (attachments && attachments.length > 0) {
    payload.attachment = attachments.map((a) => ({
      name: a.filename,
      content: Buffer.isBuffer(a.content)
        ? a.content.toString("base64")
        : a.content,
    }));
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo error ${res.status}: ${body}`);
  }
}

/* ===== CE QUI ENVERRA, ANNONCÉ AU DÉMARRAGE =====
 *
 * Il n'existait aucune trace de ce reglage dans les journaux : « fournisseur
 * retenu » n'etait calcule qu'a l'interieur d'un envoi. Pour savoir ce que le
 * serveur allait faire, il fallait ouvrir l'ecran de delivrabilite, en etant
 * administrateur. Changer MAIL_PROVIDER chez l'hebergeur et vouloir verifier
 * que le changement a bien ete repris n'avait donc pas de reponse simple.
 *
 * Et ce n'est pas une verification de confort. MAIL_PROVIDER est lu une seule
 * fois, a l'ouverture de ce fichier : modifier la variable sans que le
 * processus redemarre ne change rien, et rien ne le signalait.
 *
 * Aucune cle, aucun mot de passe : seulement qui envoie et au nom de qui.
 */
(function annoncerFournisseur() {
  const choisi = fournisseurRetenu();
  const details = { expediteur: MAIL_FROM || null };
  if (choisi === "smtp") details.serveur = `${SMTP_HOST}:${SMTP_PORT}`;

  if (choisi === "aucun") {
    console.warn(
      "[MAIL] Aucun service d'envoi utilisable." +
        (PROVIDER
          ? ` MAIL_PROVIDER vaut « ${PROVIDER} » mais ce service n'est pas configure completement.`
          : " Renseignez MAIL_PROVIDER et les variables correspondantes.")
    );
    return;
  }

  console.log(`[MAIL] Envoi par « ${choisi} » — ${JSON.stringify(details)}`);

  /* Le cas qui a coute le plus de temps ici : une cle Brevo en place, un
     domaine verifie chez Brevo, des CNAME DKIM publies — et un envoi qui passe
     quand meme par le port 587, que l'hebergeur ferme. Les messages ne partent
     jamais, et Brevo n'en sait rien : il ne voit aucun appel, donc il n'envoie
     pas non plus le courriel qui permettrait d'autoriser l'adresse du serveur. */
  if (choisi === "smtp" && brevoPret) {
    console.warn(
      "[MAIL] Une cle Brevo est configuree mais inutilisee : l'envoi passe par SMTP. " +
        "Si l'hebergeur ferme le port sortant — c'est le cas de Railway — aucun message " +
        "ne partira et aucune alerte ne remontera. Passez MAIL_PROVIDER a « brevo », " +
        "qui envoie en HTTPS, puis redemarrez le service."
    );
  }
})();

module.exports = { sendEmail, fournisseurRetenu };
