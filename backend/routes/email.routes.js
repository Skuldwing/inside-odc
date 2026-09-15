const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const pool = require("../db");
const { infoVersion } = require("../version");
const { sendEmail, fournisseurRetenu } = require("../services/mail");
const { sonderSmtp, PORTS_AUTORISES } = require("../services/sondeSmtp");
const {
  diagnostiquerDomaine,
  configurationEnvoi,
  interpreterErreurEnvoi,
} = require("../services/deliverability");

const router = express.Router();

/* Un domaine, pas une adresse : on accepte les deux et on ne garde que la
   partie apres l'arobase. */
function extraireDomaine(valeur) {
  const brut = String(valeur || "").trim().toLowerCase();
  if (!brut) return null;
  const sansArobase = brut.includes("@") ? brut.split("@").pop() : brut;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(sansArobase) ? sansArobase : null;
}

/* ===== DIAGNOSTIC DE DELIVRABILITE ===== */
router.get("/diagnostic", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const config = configurationEnvoi();
    const domaine = extraireDomaine(req.query.domaine || config.expediteur);

    if (!domaine) {
      return res.json({
        configuration: config,
        domaine: null,
        erreur:
          "Aucun domaine expediteur a verifier. Renseignez MAIL_FROM sur le serveur, ou indiquez un domaine.",
      });
    }

    const diagnostic = await diagnostiquerDomaine(domaine, config.fournisseur);
    /* Le panneau affiche la date de demarrage du serveur : si elle est
       anterieure au dernier deploiement attendu, c'est que l'hebergeur n'a pas
       repris le code, et aucun reglage n'y changera rien. */
    res.json({
      configuration: config,
      serveur: infoVersion(),
      ...diagnostic,
    });
  } catch (err) {
    console.error("[DELIVRABILITE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ENVOI D'ESSAI ===== */
/**
 * Un seul message, vers une adresse choisie, et le refus du serveur rendu tel
 * quel.
 *
 * C'est la piece qui manquait : quand une campagne ne partait pas, le seul
 * retour etait « Erreur lors de l'envoi », identique que le mot de passe soit
 * faux, que le port soit ferme ou qu'aucun service ne soit configure. Le motif
 * exact n'existait que dans les journaux du serveur.
 */
router.post("/test", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const config = configurationEnvoi();

    if (config.fournisseur === "aucun") {
      return res.status(400).json({
        success: false,
        cause: "Aucun service d'envoi n'est configure.",
        remede:
          "Renseignez MAIL_PROVIDER (« smtp » ou « brevo ») et les variables correspondantes, puis redemarrez le serveur.",
      });
    }

    /* Un mot de passe encore entre chevrons, c'est le gabarit colle tel quel.
       Autant le dire avant d'aller le presenter a Microsoft. */
    const motDePasse = process.env.SMTP_PASS || "";
    if (config.fournisseur === "smtp" && /^<.*>$/.test(motDePasse.trim())) {
      return res.status(400).json({
        success: false,
        cause: "SMTP_PASS contient encore le texte d'exemple, pas un mot de passe.",
        remede: "Remplacez la valeur par le mot de passe reel de la boite, sans les chevrons.",
      });
    }

    let destinataire = String(req.body?.destinataire || "").trim();
    if (!destinataire) {
      const moi = await pool.query("SELECT email FROM users WHERE id=$1", [req.user.id]);
      destinataire = moi.rows[0]?.email || "";
    }
    if (!destinataire.includes("@")) {
      return res.status(400).json({ success: false, cause: "Adresse de destination invalide." });
    }

    const horodatage = new Date().toLocaleString("fr-FR");
    await sendEmail({
      toEmail: destinataire,
      toName: destinataire,
      subject: "Inside ODC — essai d'envoi",
      html: `<p>Cet email confirme que la plateforme Inside ODC parvient à envoyer du courrier.</p>
             <p style="color:#64748b;font-size:13px">Expédié le ${horodatage} par ${config.expediteur} via ${config.fournisseur}.</p>`,
      text: `La plateforme Inside ODC parvient a envoyer du courrier. Expedie le ${horodatage}.`,
    });

    res.json({
      success: true,
      destinataire,
      expediteur: config.expediteur,
      fournisseur: fournisseurRetenu(),
      message:
        "Le service d'envoi a accepte le message. S'il n'arrive pas, regardez le dossier indesirables : c'est alors l'authentification du domaine qui est en cause, pas l'envoi.",
    });
  } catch (err) {
    console.error("[ESSAI ENVOI]", err);

    /* Nodemailer range l'essentiel hors du message : « Connection timeout » ne
       porte pas son code ETIMEDOUT, et un refus SMTP met son numero dans
       responseCode. On donne tout a lire a l'interprete. */
    const brut = [err?.message, err?.code, err?.responseCode, err?.command, err?.response]
      .filter(Boolean)
      .join(" · ");
    const lecture = interpreterErreurEnvoi(brut);

    /* Quand la connexion elle-meme n'aboutit pas, le motif ne suffit pas : il
       faut savoir a quelle etape elle s'arrete. La sonde le dit. */
    let sonde = null;
    if (/timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ESOCKET|Greeting/i.test(brut)) {
      try {
        sonde = await sonderSmtp();
      } catch (e) {
        console.error("[SONDE SMTP]", e.message);
      }

      /* Le remede generique parle de verifier le port. Quand une cle Brevo
         dort dans la configuration, il y a bien mieux a dire : la sortie
         existe deja, il suffit de la choisir. */
      if (process.env.BREVO_API_KEY) {
        lecture.remede =
          "Une cle Brevo est deja presente dans la configuration : passez MAIL_PROVIDER a « brevo ». " +
          "Brevo envoie en HTTPS, le port SMTP bloque n'a alors plus d'importance. " +
          "Pensez aussi a redemarrer le service apres avoir change la variable.";
      }
    }

    res.status(502).json({ success: false, ...lecture, brut: brut.slice(0, 600), sonde });
  }
});

/* ===== SONDER UN SERVEUR SMTP =====
   Repond a une seule question, mais celle qui coute le plus cher a poser
   autrement : ce serveur-la, sur ce port-la, repond-il depuis l'hebergement ?
   Sans cette route il faut changer les variables et attendre un redemarrage
   a chaque essai, soit plusieurs minutes pour une reponse qui en prend six
   secondes. Rien n'est envoye, rien n'est authentifie : on ouvre une
   connexion et on ecoute. */
router.post("/sonde-smtp", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const hote = String(req.body?.hote || "").trim();
    const port = Number(req.body?.port) || 587;

    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hote)) {
      return res.status(400).json({ error: "Nom de serveur invalide." });
    }
    if (!PORTS_AUTORISES.includes(port)) {
      return res.status(400).json({
        error: `Port non autorise. Ports de soumission acceptes : ${PORTS_AUTORISES.join(", ")}.`,
      });
    }

    const sonde = await sonderSmtp(hote, port);
    res.json({ sonde });
  } catch (err) {
    console.error("[SONDE SMTP]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
