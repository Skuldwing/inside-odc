const express = require("express");
const pool = require("../db");
const { IDENTITE } = require("../config/identite");
const { sendEmail } = require("../services/mail");
const { getTemplate, composerEmail, boutonAction } = require("./emailTemplates.routes");
const { attestationPourActivite, moduleRetenu } = require("../services/attestationActivite");
const { ensureEspaceBeneficiaire } = require("../migrations/espaceBeneficiaire");
/* La mesure d'audience de l'espace se fait ici, au serveur, et non dans le
   navigateur : ces quatre nombres sont le parcours reel — combien demandent un
   lien, combien ouvrent leur espace, combien repartent avec leur attestation.
   Comptes a la source, ils sont exacts et nul ne peut les gonfler. « noter »
   n'echoue jamais : une mesure ne doit pas pouvoir empecher un telechargement. */
const { noter } = require("../services/audience");
const {
  COOKIE, DUREE_LIEN_MINUTES, creerLien, consommerLien,
  signerSession, optionsCookie, exigerEspace, normaliser,
} = require("../services/espaceBeneficiaire");

const router = express.Router();

/* Comme ailleurs : si la migration de demarrage a echoue, la page tomberait
   sur « table inconnue » sans rien expliquer. */
let schemaRejoue = false;
async function avecSchema(travail) {
  try {
    return await travail();
  } catch (err) {
    const incomplet = err?.code === "42703" || err?.code === "42P01";
    if (!incomplet || schemaRejoue) throw err;
    schemaRejoue = true;
    console.warn("[ESPACE] schéma incomplet, migration rejouée");
    await ensureEspaceBeneficiaire();
    return travail();
  }
}

function adresseDuSite() {
  return String(process.env.APP_BASE_URL || IDENTITE.siteUrl).replace(/\/+$/, "");
}

/* ===== DEMANDER UN LIEN =====
 *
 * La reponse est toujours la meme, que l'adresse soit connue ou non, et que
 * la limite d'envoi soit atteinte ou non. Repondre « cette adresse est
 * inconnue » transformerait ce formulaire en moyen de verifier qui figure
 * dans les listes de presence du centre — une liste de noms et d'adresses
 * qu'on n'a aucune raison de rendre interrogeable.
 */
router.post("/lien", async (req, res) => {
  const reponse = {
    message: "Si cette adresse figure dans nos listes, un lien d'accès vient de lui être envoyé.",
  };
  try {
    const email = normaliser(req.body?.email);
    /* Un controle de forme, pas de validite : on ne cherche pas a dire au
       visiteur si son adresse existe, seulement a ne pas interroger la base
       pour une chaine qui n'est manifestement pas une adresse. */
    if (!email || !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
      return res.json(reponse);
    }

    /* Compte ici, et non apres la verification en base : le denominateur du
       parcours doit etre « combien ont essaye », y compris avec une adresse
       absente des listes. C'est ce chiffre-la qui dit si le formulaire se
       comprend. */
    noter("espace", "lien_demande");

    const { rows } = await avecSchema(() => pool.query(
      "SELECT COUNT(*)::int AS n FROM participants WHERE LOWER(email) = $1",
      [email]
    ));
    if (!rows[0].n) return res.json(reponse);

    const ip = ((req.headers["x-forwarded-for"] || req.ip || "").split(",")[0]).trim() || null;
    const jeton = await creerLien(email, ip);
    if (!jeton) return res.json(reponse);

    const lien = `${adresseDuSite()}/espace?jeton=${jeton}`;
    const tpl = await getTemplate("espace_lien");
    const vars = {
      lien,
      duree: `${DUREE_LIEN_MINUTES} minutes`,
      bouton: boutonAction(lien, "Ouvrir mon espace"),
    };

    await sendEmail({
      toEmail: email,
      subject: tpl.subject,
      html: composerEmail(tpl, vars),
      text:
        `Voici votre lien d'accès à votre espace ${IDENTITE.nom} :\n\n${lien}\n\n` +
        `Il est valable ${DUREE_LIEN_MINUTES} minutes et ne peut servir qu'une fois.\n\n` +
        `Si vous n'avez rien demandé, ignorez ce message.`,
    });

    noter("espace", "lien_envoye");
    res.json(reponse);
  } catch (err) {
    /* Meme en cas de panne d'envoi, on ne dit rien de plus : le visiteur ne
       doit pas pouvoir deduire d'un message d'erreur que son adresse existe.
       La panne, elle, est tracee cote serveur. */
    console.error("[ESPACE] envoi du lien :", err.message);
    res.json(reponse);
  }
});

/* ===== ÉCHANGER LE LIEN CONTRE UNE SESSION ===== */
router.post("/session", async (req, res) => {
  try {
    const email = await avecSchema(() => consommerLien(req.body?.jeton));
    if (!email) {
      return res.status(401).json({
        error: "Ce lien n'est plus valable. Demandez-en un nouveau.",
      });
    }
    res.cookie(COOKIE, signerSession(email), optionsCookie());
    noter("espace", "session_ouverte");
    res.json({ email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/deconnexion", (req, res) => {
  res.clearCookie(COOKIE, { ...optionsCookie(), maxAge: undefined });
  res.json({ success: true });
});

/* ===== CE QUE L'ADRESSE DONNE À VOIR =====
 *
 * Une meme adresse peut porter plusieurs fiches : un telecentre, un parent
 * qui inscrit ses enfants, une adresse familiale. On les renvoie toutes, et
 * l'ecran previent que l'adresse est partagee — c'est la realite du terrain,
 * et masquer les autres fiches reviendrait a priver d'acces des gens qui
 * n'ont pas d'autre adresse.
 */
async function dossierDe(email) {
  const { rows: fiches } = await pool.query(
    `SELECT p.id, p.nom, p.prenom, p.email, p.telephone
       FROM participants p
      WHERE LOWER(p.email) = $1
      ORDER BY p.nom, p.prenom, p.id`,
    [email]
  );
  if (!fiches.length) return { fiches: [], formations: [] };

  const ids = fiches.map((f) => f.id);
  const { rows: formations } = await pool.query(
    `SELECT ap.participant_id,
            a.id AS activite_id,
            a.title AS intitule,
            a.activity_date AS date,
            a.location AS lieu,
            COALESCE(a.mode, 'presentiel') AS mode,
            a.duration_hours AS heures,
            pa.name AS partenaire,
            d.name  AS dispositif,
            u.full_name AS coach,
            ae.envoye_le AS attestation_envoyee_le
       FROM activity_participants ap
       JOIN activities a ON a.id = ap.activity_id
       LEFT JOIN partners pa ON pa.id = a.partner_id
       LEFT JOIN devices  d  ON d.id  = a.device_id
       LEFT JOIN users    u  ON u.id  = a.coach_id
       LEFT JOIN attestations_envoyees ae
              ON ae.activity_id = a.id AND ae.participant_id = ap.participant_id
      WHERE ap.participant_id = ANY($1::int[])
      ORDER BY a.activity_date DESC NULLS LAST, a.id DESC`,
    [ids]
  );

  return { fiches, formations };
}

router.get("/moi", exigerEspace, async (req, res) => {
  try {
    const { fiches, formations } = await avecSchema(() => dossierDe(req.espace.email));
    res.json({
      email: req.espace.email,
      /* « partagee » declenche la mention a l'ecran. On la calcule ici plutot
         que de laisser l'ecran compter : la regle doit etre la meme partout. */
      partagee: fiches.length > 1,
      fiches: fiches.map((f) => ({
        id: f.id,
        nom: [f.prenom, f.nom].filter(Boolean).join(" ").trim() || "Sans nom",
        telephone: f.telephone || null,
        formations: formations
          .filter((x) => x.participant_id === f.id)
          .map((x) => ({
            activite_id: x.activite_id,
            intitule: x.intitule,
            date: x.date,
            lieu: x.lieu,
            mode: x.mode,
            heures: x.heures,
            organisateur: x.partenaire || x.coach || null,
            dispositif: x.dispositif || null,
            attestation_envoyee_le: x.attestation_envoyee_le || null,
          })),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== TÉLÉCHARGER UNE ATTESTATION =====
 *
 * Le document est fabrique a la demande, jamais lu depuis un stockage : il n'y
 * en a pas. Le controle d'acces porte sur le couple fiche + activite, et la
 * fiche doit appartenir a l'adresse de la session — sans quoi un numero
 * d'activite devine ouvrirait l'attestation de n'importe qui.
 */
router.get("/attestation/:ficheId/:activiteId", exigerEspace, async (req, res) => {
  try {
    const ficheId = Number(req.params.ficheId);
    const activiteId = Number(req.params.activiteId);
    if (!Number.isInteger(ficheId) || !Number.isInteger(activiteId)) {
      return res.status(400).json({ error: "Demande invalide" });
    }

    const { rows } = await avecSchema(() => pool.query(
      `SELECT p.id AS participant_id, p.nom, p.prenom, p.email,
              a.id AS activity_id, a.title, a.activity_date, a.location,
              a.duration_hours, a.device_id, a.partner_id, a.coach_id,
              pa.name AS partner_name, d.name AS device_name, u.full_name AS coach_name
         FROM activity_participants ap
         JOIN participants p ON p.id = ap.participant_id
         JOIN activities   a ON a.id = ap.activity_id
         LEFT JOIN partners pa ON pa.id = a.partner_id
         LEFT JOIN devices  d  ON d.id  = a.device_id
         LEFT JOIN users    u  ON u.id  = a.coach_id
        WHERE ap.participant_id = $1
          AND ap.activity_id = $2
          AND LOWER(p.email) = $3`,
      [ficheId, activiteId, req.espace.email]
    ));

    if (!rows.length) {
      /* « Introuvable » et non « interdit » : pour qui n'y a pas droit, cette
         attestation n'existe pas. */
      return res.status(404).json({ error: "Introuvable" });
    }

    const l = rows[0];
    const participant = { id: l.participant_id, nom: l.nom, prenom: l.prenom, email: l.email };
    const activity = {
      id: l.activity_id, title: l.title, activity_date: l.activity_date,
      location: l.location, duration_hours: l.duration_hours,
      device_id: l.device_id, partner_id: l.partner_id, coach_id: l.coach_id,
      partner_name: l.partner_name, device_name: l.device_name, coach_name: l.coach_name,
    };

    const pdf = await attestationPourActivite({
      participant,
      activity,
      module: moduleRetenu(activity, null),
    });

    const nomFichier = `attestation_${[l.prenom, l.nom].filter(Boolean).join("_")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9_]/gi, "_").toLowerCase() || "participation"}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nomFichier}"`);
    res.send(pdf);
    /* Apres l'envoi : un document qui n'est pas parti n'a pas ete telecharge. */
    noter("espace", "attestation");
  } catch (err) {
    console.error("[ESPACE] attestation :", err.message);
    res.status(500).json({ error: "La génération du document a échoué." });
  }
});

module.exports = router;
