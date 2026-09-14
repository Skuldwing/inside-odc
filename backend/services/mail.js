/* Un copier-coller dans une interface d'hebergeur ramene volontiers une
   espace ou un retour a la ligne. Invisible a l'oeil, mais la cle part alors
   avec, et le service repond « cle inconnue » sur une cle pourtant juste. */
const propre = (v) => (typeof v === "string" ? v.trim() : v);

const BREVO_API_KEY = propre(process.env.BREVO_API_KEY);
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
const smtpPret = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM);

function fournisseurRetenu() {
  if (PROVIDER === "brevo") return brevoPret ? "brevo" : "aucun";
  if (PROVIDER === "smtp") return smtpPret ? "smtp" : "aucun";
  if (brevoPret) return "brevo";
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

async function sendEmail({ toEmail, toName, subject, html, text, attachments = [], bcc = [], cc = [], headers = {}, replyTo = null }) {
  const fournisseur = fournisseurRetenu();
  const repondreA = replyTo || MAIL_REPLY_TO;

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
    return;
  }

  if (fournisseur === "aucun") {
    console.warn(
      "[MAIL] Aucun service d'envoi configure (MAIL_PROVIDER / BREVO_API_KEY / SMTP_*). Message ignore."
    );
    return;
  }

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

module.exports = { sendEmail, fournisseurRetenu };
