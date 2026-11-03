const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { IDENTITE } = require("../config/identite");

const router = express.Router();

/* ===================================================================
 * LA MISE EN PAGE DES MESSAGES
 *
 * Un courriel ne se compose pas comme une page web. Outlook rend le HTML
 * avec le moteur de Word : ni flexbox, ni grille, ni « border-radius » sur
 * un conteneur. Gmail supprime la balise <style> de l'en-tete. On en revient
 * donc a ce qui marche partout depuis vingt ans : des tableaux imbriques et
 * des styles en ligne, un par balise.
 *
 * Trois choix qui ne se voient pas mais qui comptent.
 *
 * Aucune image. Le logo est du texte. Un client qui bloque les images par
 * defaut — c'est le cas de la plupart — afficherait sinon un cadre vide a la
 * place de l'en-tete, et le message s'ouvrirait sur un defaut.
 *
 * Un « preheader » : la ligne que la boite de reception affiche en apercu,
 * apres l'objet. Sans elle, le client y met le premier texte qu'il trouve —
 * souvent « Bonjour », ou pire, le texte cache de la mise en page. C'est la
 * premiere chose que voit le destinataire, avant meme d'ouvrir.
 *
 * Et sous chaque bouton, l'adresse en clair. Un bouton est un lien stylé :
 * quand le style saute, il reste un mot cliquable que certains clients
 * n'affichent pas en bleu. L'adresse ecrite dessous est la porte de secours,
 * et elle se copie-colle.
 * =================================================================== */

const POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const ORANGE = "#FF6600";
const ENCRE = "#0F172A";
const GRIS = "#64748B";

/* Un bouton qui tient dans Outlook : le fond est porte par la cellule, le
   remplissage par le lien. Un <a> seul avec « padding » y perd sa surface
   cliquable. */
function bouton(lien, texte) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 12px">
          <tr>
            <td align="center" bgcolor="${ORANGE}" style="border-radius:8px">
              <a href="${lien}" style="display:inline-block;padding:14px 32px;font-family:${POLICE};font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px">${texte}</a>
            </td>
          </tr>
        </table>
        <p style="margin:0 0 4px;font-family:${POLICE};font-size:12px;line-height:18px;color:${GRIS};text-align:center">
          Si le bouton ne fonctionne pas, copiez cette adresse&nbsp;:
        </p>
        <p style="margin:0 0 8px;font-family:${POLICE};font-size:12px;line-height:18px;color:${GRIS};text-align:center;word-break:break-all">
          <a href="${lien}" style="color:${ORANGE};text-decoration:underline">${lien}</a>
        </p>`;
}

function gabarit({ apercu, corps }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${IDENTITE.nomCourt}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F9">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F1F5F9;opacity:0">${apercu}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F1F5F9">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border-radius:12px;overflow:hidden">

        <tr>
          <td align="center" bgcolor="${ORANGE}" style="padding:28px 24px">
            <div style="font-family:${POLICE};font-size:22px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px">${IDENTITE.nomCourt}</div>
            <div style="font-family:${POLICE};font-size:12px;color:#FFE8D6;padding-top:4px">${IDENTITE.description}</div>
          </td>
        </tr>

        <tr>
          <td style="padding:32px 32px 24px">
${corps}
          </td>
        </tr>

        <tr>
          <td style="padding:0 32px"><div style="height:1px;background-color:#E2E8F0;font-size:0;line-height:0">&nbsp;</div></td>
        </tr>

        <tr>
          <td align="center" style="padding:20px 32px 28px">
            <p style="margin:0 0 6px;font-family:${POLICE};font-size:13px;line-height:20px;color:${GRIS}">
              <a href="${IDENTITE.siteUrl}" style="color:${ORANGE};text-decoration:none;font-weight:bold">${IDENTITE.domaine}</a>
              &nbsp;&middot;&nbsp;
              <a href="mailto:${IDENTITE.contact}" style="color:${GRIS};text-decoration:underline">${IDENTITE.contact}</a>
            </p>
            <p style="margin:0;font-family:${POLICE};font-size:11px;line-height:17px;color:#94A3B8">
              ${IDENTITE.nom} &mdash; message automatique, merci de ne pas y répondre directement.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/* Les styles de texte du corps, nommes une fois pour que les trois gabarits
   ne divergent pas au fil des retouches. */
const P = `margin:0 0 14px;font-family:${POLICE};font-size:15px;line-height:24px;color:${ENCRE}`;
const PETIT = `margin:0 0 14px;font-family:${POLICE};font-size:13px;line-height:20px;color:${GRIS}`;

const DEFAULTS = {
  welcome: {
    slug: "welcome",
    label: "Bienvenue (création de compte)",
    description: "Envoyé automatiquement quand un admin crée un nouveau compte utilisateur.",
    subject: `Votre accès ${IDENTITE.nomCourt}`,
    apercu: "Votre compte est créé. Il reste à choisir votre mot de passe.",
    body_html: `            <p style="${P}">Bonjour <strong>{{nom}}</strong>,</p>
            <p style="${P}">Un compte vient d'être créé pour vous sur ${IDENTITE.nom}. Il ne manque que votre mot de passe pour commencer.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;border-left:3px solid ${ORANGE};border-radius:0 8px 8px 0;margin:0 0 8px">
              <tr>
                <td style="padding:14px 16px">
                  <div style="font-family:${POLICE};font-size:12px;color:${GRIS};text-transform:uppercase;letter-spacing:0.6px">Votre identifiant</div>
                  <div style="font-family:${POLICE};font-size:15px;font-weight:bold;color:${ENCRE};padding-top:3px">{{email}}</div>
                </td>
              </tr>
            </table>

{{bouton}}
            <p style="${PETIT};text-align:center">Ce lien est valable <strong>24&nbsp;heures</strong>. Passé ce délai, demandez-en un nouveau à l'administrateur qui vous a inscrit.</p>`,
    variables: ["{{nom}}", "{{email}}", "{{lien}}", "{{bouton}}"],
  },
  reset_password: {
    slug: "reset_password",
    label: "Réinitialisation du mot de passe",
    description: "Envoyé quand un admin déclenche un reset depuis la page Utilisateurs.",
    subject: `Réinitialisation de votre mot de passe ${IDENTITE.nomCourt}`,
    apercu: "Un lien pour choisir un nouveau mot de passe vous attend.",
    body_html: `            <p style="${P}">Bonjour <strong>{{nom}}</strong>,</p>
            <p style="${P}">Une réinitialisation de mot de passe a été demandée pour votre compte ${IDENTITE.nom}.</p>

{{bouton}}
            <p style="${PETIT};text-align:center">Ce lien est valable <strong>24&nbsp;heures</strong> et ne peut servir qu'une fois.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FEF3C7;border-radius:8px;margin:18px 0 0">
              <tr>
                <td style="padding:14px 16px">
                  <p style="margin:0;font-family:${POLICE};font-size:13px;line-height:20px;color:#78350F">
                    <strong>Vous n'avez rien demandé&nbsp;?</strong> Votre mot de passe actuel reste valable : vous pouvez ignorer ce message.
                    Si cela se répète, <a href="mailto:${IDENTITE.contact}?subject=${encodeURIComponent("Réinitialisation non demandée")}" style="color:#78350F;text-decoration:underline">prévenez-nous</a>.
                  </p>
                </td>
              </tr>
            </table>`,
    variables: ["{{nom}}", "{{lien}}", "{{bouton}}"],
  },
  attestation: {
    slug: "attestation",
    label: "Attestation de participation",
    description: "Envoyé avec le PDF quand l'admin clique ✉ sur une activité.",
    subject: "Votre attestation de participation — {{activite}}",
    apercu: "Votre attestation de participation est jointe à ce message, au format PDF.",
    body_html: `            <p style="${P}">Bonjour <strong>{{nom}}</strong>,</p>
            <p style="${P}">Votre attestation de participation est jointe à ce message, au format PDF. Vous pouvez la télécharger, l'imprimer et la conserver.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF7ED;border-left:3px solid ${ORANGE};border-radius:0 8px 8px 0;margin:4px 0 16px">
              <tr>
                <td style="padding:16px">
                  <div style="font-family:${POLICE};font-size:12px;color:${GRIS};text-transform:uppercase;letter-spacing:0.6px">Formation suivie</div>
                  <div style="font-family:${POLICE};font-size:17px;font-weight:bold;line-height:24px;color:${ENCRE};padding-top:4px">{{activite}}</div>
{{details}}
                </td>
              </tr>
            </table>

{{organisateur}}
            <p style="${P}">Merci de votre participation. Nous espérons vous revoir bientôt.</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;border-radius:8px;margin:20px 0 0">
              <tr>
                <td style="padding:14px 16px">
                  <p style="margin:0;font-family:${POLICE};font-size:13px;line-height:20px;color:${GRIS}">
                    <strong style="color:${ENCRE}">Ce message ne vous concerne pas&nbsp;?</strong><br>
                    Si vous n'avez pas suivi cette formation, ou si votre nom est mal orthographié,
                    <a href="{{signalement}}" style="color:${ORANGE};text-decoration:underline;font-weight:bold">signalez-le-nous</a>
                    — le message est pré-rempli, il n'y a qu'à l'envoyer.
                  </p>
                </td>
              </tr>
            </table>`,
    /* « organisateur » et « details » sont des fragments tout faits, pas des
       valeurs : le gabarit ne sait pas poser de condition, et « Animée par . »
       ou « Durée :  » sur une activité incomplète se liraient mal. Ils sont
       vides quand il n'y a rien à dire. Voir « phraseOrganisateur » et
       « blocDetails » plus bas. */
    variables: ["{{nom}}", "{{activite}}", "{{date}}", "{{partenaire}}", "{{organisateur}}", "{{details}}", "{{signalement}}", "{{dispositif}}", "{{duree}}"],
  },
};

async function getTemplate(slug) {
  try {
    const res = await pool.query("SELECT * FROM email_templates WHERE slug = $1", [slug]);
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        ...row,
        variables: Array.isArray(row.variables) ? row.variables : JSON.parse(row.variables || "[]"),
        description: row.description || DEFAULTS[slug]?.description || "",
        /* L'apercu n'est pas editable : il appartient a la mise en page, que
           l'ecran d'administration ne touche pas. */
        apercu: DEFAULTS[slug]?.apercu || "",
      };
    }
  } catch {}
  return DEFAULTS[slug] || null;
}

/**
 * La phrase qui dit qui a animé la formation.
 *
 * Un bénéficiaire formé par un partenaire recevait un message signé « Inside
 * ODC Sénégal » qui ne nommait que l'intitulé de la séance. Deux personnes
 * ont écrit pour dire qu'elles n'avaient jamais suivi cette formation — elles
 * l'avaient suivie, mais chez le partenaire, et rien dans le message ne
 * permettait de faire le lien.
 *
 * Le gabarit ne sait pas poser de condition : on compose donc la phrase ici,
 * et elle est vide quand l'activité n'a ni partenaire ni formateur.
 */
function phraseOrganisateur(partenaire) {
  const nom = String(partenaire || "").trim();
  if (!nom) return "";
  return `            <p style="${P}">Cette formation a été animée par <strong>${nom}</strong>, ` +
    `en partenariat avec Orange Digital Center.</p>`;
}

/**
 * La date, le dispositif et la durée — ceux qui sont renseignés, et eux seuls.
 *
 * Même raison que la phrase ci-dessus : le gabarit ne sait pas poser de
 * condition. Écrire « Durée : » en dur donnerait « Durée : » suivi de rien sur
 * les deux chemins d'envoi qui ne transmettent pas cette valeur, et une fiche
 * à trous se lit comme une erreur de la plateforme plutôt que comme un
 * renseignement manquant.
 */
function blocDetails({ date, dispositif, duree } = {}) {
  const lignes = [
    ["Date", date],
    ["Dispositif", dispositif],
    ["Durée", duree],
  ].filter(([, v]) => String(v || "").trim());

  if (!lignes.length) return "";

  return `                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0">
${lignes.map(([cle, valeur]) => `                    <tr>
                      <td style="padding:2px 16px 2px 0;font-family:${POLICE};font-size:13px;line-height:20px;color:${GRIS};white-space:nowrap">${cle}</td>
                      <td style="padding:2px 0;font-family:${POLICE};font-size:13px;line-height:20px;color:${ENCRE};font-weight:bold">${valeur}</td>
                    </tr>`).join("\n")}
                  </table>`;
}

/**
 * Le lien de signalement, pré-rempli, pour l'attestation.
 *
 * Deux bénéficiaires ont écrit pour dire qu'ils n'avaient pas suivi la
 * formation pour laquelle ils recevaient une attestation. Ils ont dû chercher
 * une adresse et tout rédiger. Un lien qui ouvre un message déjà écrit retire
 * cette friction, et c'est ainsi qu'on apprend qu'un envoi s'est trompé de
 * destinataire.
 *
 * Il se construit ici et non dans le gabarit : une adresse « mailto » encode
 * ses paramètres, et une variable laissée dans la chaîne à encoder en
 * ressortirait sous la forme « %7B%7Bactivite%7D%7D », que plus rien ne sait
 * remplacer. On encode donc les vraies valeurs, une fois connues.
 */
function lienSignalement({ nom, activite } = {}) {
  const titre = String(activite || "").trim() || "une formation";
  const qui = String(nom || "").trim();
  const sujet = `Signalement — attestation ${titre}`;
  const corps =
    `Bonjour,\n\n` +
    `J'ai reçu une attestation pour « ${titre} »${qui ? ` au nom de ${qui}` : ""}.\n\n` +
    `Motif de mon signalement :\n`;
  return `mailto:${IDENTITE.contact}` +
    `?subject=${encodeURIComponent(sujet)}` +
    `&body=${encodeURIComponent(corps)}`;
}

/**
 * Le message complet, prêt à partir : le corps rempli, posé dans la mise en page.
 *
 * C'est ici que les deux se rejoignent, et pas en base. L'écran d'administration
 * édite les modèles avec un éditeur de texte enrichi — TipTap, qui analyse le
 * HTML selon son propre schéma et jette ce qu'il ne reconnaît pas : les styles
 * en ligne, les tableaux de mise en page, le doctype. Stocker l'habillage dans
 * le champ éditable revenait à le laisser détruire au premier enregistrement,
 * même sans modification, puisque l'éditeur réécrit ce qu'il a chargé.
 *
 * L'administrateur garde donc la main sur ce qui se dit. L'en-tête, le pied de
 * page, le texte d'aperçu et le bouton appartiennent à la plateforme, qui les
 * applique au moment de l'envoi — hors de portée de l'éditeur.
 */
function composerEmail(tpl, vars = {}) {
  return gabarit({
    apercu: tpl?.apercu || "",
    corps: renderTemplate(tpl?.body_html || "", vars),
  });
}

/**
 * Le bouton d'action, composé plutôt qu'écrit dans le modèle.
 *
 * Même raison : un bouton n'est qu'un lien dont la surface cliquable tient
 * entièrement dans ses styles. L'éditeur les supprime, et il n'en resterait
 * qu'un mot souligné. On le fabrique donc ici, et le modèle ne porte que
 * l'endroit où il se pose.
 */
function boutonAction(lien, texte) {
  return String(lien || "").trim() ? bouton(lien, texte) : "";
}

/* Une variable laissée de côté ne doit jamais arriver chez le destinataire.
 *
 * Le remplacement ne parcourait que les clés fournies : tout « {{machin} }»
 * absent de l'appel survivait tel quel dans le message envoyé. Les attestations
 * parties depuis les modèles personnalisés affichaient ainsi « {{organisateur}} »
 * en toutes lettres, cette route ne transmettant pas cette variable.
 *
 * On balaie donc ce qui reste à la fin. C'est aussi un filet pour les gabarits
 * retouchés depuis l'écran d'administration, où rien n'empêche de taper le nom
 * d'une variable qui n'existe pas. */
function renderTemplate(html, vars) {
  const rendu = Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{{${k}}}`).join(v == null ? "" : String(v)),
    String(html || "")
  );
  return rendu.replace(/\{\{\s*[\w.-]+\s*\}\}/g, "");
}

/* GET all templates */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const slugs = Object.keys(DEFAULTS);
    const templates = await Promise.all(slugs.map(getTemplate));
    res.json(templates.filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* PUT update a template */
router.put("/:slug", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { slug } = req.params;
    if (!DEFAULTS[slug]) return res.status(404).json({ error: "Template introuvable" });

    const { subject, body_html } = req.body;
    if (!subject || !body_html) return res.status(400).json({ error: "Sujet et corps requis" });

    const def = DEFAULTS[slug];
    await pool.query(
      `INSERT INTO email_templates (slug, label, description, subject, body_html, variables, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (slug) DO UPDATE
       SET subject=$4, body_html=$5, updated_at=NOW()`,
      [slug, def.label, def.description, subject, body_html, JSON.stringify(def.variables)]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Reset to default */
router.delete("/:slug/reset", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { slug } = req.params;
    await pool.query("DELETE FROM email_templates WHERE slug = $1", [slug]);
    res.json({ success: true, template: DEFAULTS[slug] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = {
  router, getTemplate, renderTemplate, composerEmail,
  phraseOrganisateur, blocDetails, lienSignalement, boutonAction,
};
