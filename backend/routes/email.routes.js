const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const pool = require("../db");
const { sendEmail, fournisseurRetenu } = require("../services/mail");
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
    res.json({ configuration: config, ...diagnostic });
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
    const brut = String(err?.message || err);
    res.status(502).json({ success: false, ...interpreterErreurEnvoi(brut), brut: brut.slice(0, 600) });
  }
});

module.exports = router;
