const pool = require("../db");
const { IDENTITE } = require("../config/identite");
const { sendEmail } = require("./mail");
const {
  getTemplate, renderTemplate, composerEmail, boutonAction, blocLignes,
} = require("../routes/emailTemplates.routes");

/**
 * Prévenir les gens de ce qu'on leur confie.
 *
 * Mbootay distribuait du travail en silence : on désignait un pilote, on
 * ajoutait quelqu'un à une équipe, on assignait une tâche — et la personne ne
 * l'apprenait qu'en ouvrant l'écran, si elle pensait à l'ouvrir.
 *
 *
 * TROIS RÈGLES, ET ELLES COMPTENT PLUS QUE LE RESTE
 *
 * 1. On ne s'écrit jamais à soi-même. Créer un projet et s'en désigner pilote,
 *    s'ajouter à sa propre équipe, se confier une tâche : rien ne part. C'est
 *    le cas le plus fréquent, et sans cette règle la fonctionnalité serait
 *    insupportable dès le premier jour.
 *
 * 2. On n'écrit que sur un changement réel. La liste des membres est
 *    réenregistrée en entier à chaque fois — l'écran envoie toute la liste,
 *    pas les ajouts. Sans comparaison entre l'avant et l'après, cocher une
 *    case de plus réexpédierait un message à toute l'équipe. De même, modifier
 *    la date d'un projet sans toucher à son pilote n'écrit à personne.
 *
 * 3. Un envoi qui échoue ne doit jamais faire échouer l'action. Le service
 *    d'envoi est hors service tant que l'adresse du serveur n'est pas
 *    autorisée chez Brevo ; si on attendait sa réponse, créer un projet
 *    renverrait une erreur alors que le projet est bien créé. Tout part donc
 *    sans être attendu, et un échec se lit dans les journaux.
 */

function lienProjet(projetId) {
  const base = String(process.env.APP_BASE_URL || IDENTITE.siteUrl).replace(/\/+$/, "");
  return `${base}/mbootay/${projetId}`;
}

const LIBELLE_STATUT = {
  non_demarre: "Non démarré",
  en_cours: "En cours",
  en_pause: "En pause",
  termine: "Terminé",
  a_faire: "À faire",
  annule: "Annulé",
};

const LIBELLE_PRIORITE = { basse: "Basse", normale: "Normale", haute: "Haute" };

function dateFr(valeur) {
  if (!valeur) return null;
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/* Le prénom seul quand on l'a : « Bonjour Awa » se lit mieux que « Bonjour Awa
   Ndiaye », et un message de travail n'a pas à être protocolaire. */
function prenom(nomComplet) {
  const entier = String(nomComplet || "").trim();
  return entier ? entier.split(/\s+/)[0] : "";
}

/**
 * Les comptes à prévenir : ceux qui existent, qui ont une adresse, et qui ne
 * sont pas l'auteur de l'action.
 */
async function destinataires(ids, auteurId) {
  const voulus = [...new Set((ids || []).map(Number).filter(Number.isInteger))]
    .filter((id) => id !== Number(auteurId));
  if (!voulus.length) return [];

  const { rows } = await pool.query(
    `SELECT id, full_name, email FROM users
      WHERE id = ANY($1::int[])
        AND email IS NOT NULL AND email <> ''
        AND (is_active IS DISTINCT FROM false)`,
    [voulus]
  );
  return rows;
}

async function nomDe(userId) {
  if (!userId) return null;
  const { rows } = await pool.query("SELECT full_name, email FROM users WHERE id = $1", [userId]);
  return rows[0]?.full_name || rows[0]?.email || null;
}

/** Un envoi, jamais attendu, jamais bruyant. */
function expedier({ slug, destinataire, vars, lien }) {
  (async () => {
    const tpl = await getTemplate(slug);
    if (!tpl) return;

    const complet = { ...vars, lien, bouton: boutonAction(lien, "Ouvrir dans Mbootay") };

    await sendEmail({
      toEmail: destinataire.email,
      toName: destinataire.full_name || destinataire.email,
      subject: renderTemplate(tpl.subject, complet),
      html: composerEmail(tpl, complet),
      text: vars.texteBrut,
    });
  })().catch((err) =>
    /* Le message exact du service d'envoi, pas un « échec » générique : c'est
       ce qui permet de distinguer une adresse refusée d'un port fermé. */
    console.warn(`[MBOOTAY] notification « ${slug} » non envoyée :`, err.message)
  );
}

/* ===== UN PROJET CONFIÉ ===== */
/**
 * @param {object} projet   la ligne mbootay_projects après écriture
 * @param {number} auteurId qui a fait l'action
 * @param {boolean} nouveau vrai à la création, faux sur une réaffectation
 */
async function notifierPiloteProjet({ projet, auteurId, nouveau }) {
  const cibles = await destinataires([projet?.owner_id], auteurId);
  if (!cibles.length) return;

  const par = await nomDe(auteurId);
  const details = blocLignes([
    ["Statut", LIBELLE_STATUT[projet.status] || projet.status],
    ["Début", dateFr(projet.start_date)],
    ["Échéance", dateFr(projet.due_date)],
  ]);

  for (const cible of cibles) {
    const intro = nouveau
      ? `Un nouveau projet vient d'être créé dans Mbootay${par ? ` par ${par}` : ""}, et vous en êtes le pilote.`
      : `${par || "Quelqu'un"} vous a confié le pilotage d'un projet dans Mbootay.`;

    expedier({
      slug: "mbootay_projet",
      destinataire: cible,
      lien: lienProjet(projet.id),
      vars: {
        nom: prenom(cible.full_name) || cible.email,
        projet: projet.title,
        intro,
        details,
        texteBrut:
          `${intro}\n\nProjet : ${projet.title}\n\n${lienProjet(projet.id)}`,
      },
    });
  }
}

/* ===== DES MEMBRES AJOUTÉS À UNE ÉQUIPE ===== */
/**
 * @param {number[]} ajoutes uniquement les identifiants qui n'étaient pas
 *                           déjà dans l'équipe — la comparaison se fait dans
 *                           la route, qui seule connaît l'état d'avant.
 */
async function notifierNouveauxMembres({ projet, ajoutes, auteurId }) {
  const cibles = await destinataires(ajoutes, auteurId);
  if (!cibles.length) return;

  const par = await nomDe(auteurId);
  const details = blocLignes([
    ["Statut", LIBELLE_STATUT[projet.status] || projet.status],
    ["Pilote", projet.owner_name],
    ["Échéance", dateFr(projet.due_date)],
  ]);

  const intro = `${par || "Quelqu'un"} vous a ajouté à l'équipe d'un projet dans Mbootay.`;

  for (const cible of cibles) {
    expedier({
      slug: "mbootay_equipe",
      destinataire: cible,
      lien: lienProjet(projet.id),
      vars: {
        nom: prenom(cible.full_name) || cible.email,
        projet: projet.title,
        intro,
        details,
        texteBrut: `${intro}\n\nProjet : ${projet.title}\n\n${lienProjet(projet.id)}`,
      },
    });
  }
}

/* ===== UNE TÂCHE ASSIGNÉE ===== */
async function notifierTacheAssignee({ tache, projet, auteurId }) {
  const cibles = await destinataires([tache?.assigned_to], auteurId);
  if (!cibles.length) return;

  const par = await nomDe(auteurId);
  const details = blocLignes([
    ["Projet", projet?.title],
    ["Statut", LIBELLE_STATUT[tache.status] || tache.status],
    ["Priorité", LIBELLE_PRIORITE[tache.priority] || tache.priority],
    ["Échéance", dateFr(tache.due_date)],
  ]);

  const intro = `${par || "Quelqu'un"} vous a confié une tâche dans Mbootay${
    projet?.title ? `, sur le projet « ${projet.title} »` : ""
  }.`;

  for (const cible of cibles) {
    expedier({
      slug: "mbootay_tache",
      destinataire: cible,
      lien: lienProjet(tache.project_id),
      vars: {
        nom: prenom(cible.full_name) || cible.email,
        tache: tache.title,
        projet: projet?.title || "",
        intro,
        details,
        texteBrut:
          `${intro}\n\nTâche : ${tache.title}\n\n${lienProjet(tache.project_id)}`,
      },
    });
  }
}

module.exports = {
  notifierPiloteProjet,
  notifierNouveauxMembres,
  notifierTacheAssignee,
  /* Exportés pour les contrôles : ce sont eux qui portent les règles. */
  destinataires,
  lienProjet,
  prenom,
  dateFr,
};
