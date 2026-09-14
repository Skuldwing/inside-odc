const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { diagnostiquerDomaine, configurationEnvoi } = require("../services/deliverability");

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

    const diagnostic = await diagnostiquerDomaine(domaine);
    res.json({ configuration: config, ...diagnostic });
  } catch (err) {
    console.error("[DELIVRABILITE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
