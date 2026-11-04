const express = require("express");
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const requireSuperAdmin = require("../middleware/superAdmin.middleware");
const { ensureAudience } = require("../migrations/audience");
const { lireSignal, enregistrerSignal, synthese } = require("../services/audience");

const router = express.Router();

/* Comme ailleurs : si la migration de demarrage a echoue, la page tomberait sur
   « table inconnue » sans rien expliquer. */
let schemaRejoue = false;
async function avecSchema(travail) {
  try {
    return await travail();
  } catch (err) {
    const incomplet = err?.code === "42703" || err?.code === "42P01";
    if (!incomplet || schemaRejoue) throw err;
    schemaRejoue = true;
    console.warn("[AUDIENCE] schéma incomplet, migration rejouée");
    await ensureAudience();
    return travail();
  }
}

/* ===== LE SIGNAL =====
 *
 * Publique, et elle doit l'etre : le visiteur de la page d'accueil n'a pas de
 * compte. D'ou trois precautions.
 *
 * Le corps est lu en « text/plain ». Ce n'est pas une negligence : c'est le
 * seul type que le navigateur accepte d'envoyer a une autre origine sans
 * demander d'abord la permission. En « application/json », chaque battement de
 * coeur serait precede d'une requete OPTIONS — deux fois plus d'appels pour
 * la meme mesure. C'est aussi ce que « sendBeacon » envoie par defaut quand on
 * quitte la page.
 *
 * Quatre kilo-octets suffisent largement : un signal fait trois cents octets.
 *
 * La reponse est toujours « 204 », meme quand rien n'a ete ecrit. Un visiteur
 * n'a aucune raison de savoir si sa mesure a ete retenue, et une adresse
 * publique qui repond « 400 » pour tel corps et « 204 » pour tel autre se
 * laisse explorer.
 */
const limiteurSignal = rateLimit({
  /* Large, et c'est deliberé : au Senegal une bonne part du trafic mobile sort
     par un petit nombre d'adresses operateur. Un plafond etroit ferait
     disparaitre la mesure des visiteurs d'Orange avant celle d'un attaquant.
     Le vrai garde-fou contre le gonflage est ailleurs : les plafonds SQL par
     visite et la borne sur les provenances distinctes. */
  windowMs: 60 * 1000,
  max: Number(process.env.AUDIENCE_RATE_LIMIT_MAX || 1200),
  standardHeaders: true,
  legacyHeaders: false,
  /* Pas de corps d'erreur : meme silence que la reponse normale. */
  handler: (req, res) => res.status(204).end(),
});

/* Un corps illisible n'est pas un incident, c'est le quotidien d'une adresse
 * publique : un scanner, un robot, un fragment tronque par une coupure reseau.
 *
 * Sans ce gestionnaire, le lecteur de JSON leve, l'erreur remonte au
 * gestionnaire general d'Express, et deux choses se produisent — la reponse
 * devient « 400 » la ou un corps valide recoit « 204 », ce qui rend l'adresse
 * explorable ; et une trace de pile part dans les journaux de l'hebergeur a
 * chaque appel, donc n'importe qui peut les remplir.
 *
 * Quatre parametres : c'est ainsi qu'Express reconnait un gestionnaire
 * d'erreur, et il doit etre place juste apres le lecteur qu'il couvre. */
function corpsIllisible(err, req, res, next) {
  if (res.headersSent) return next(err);
  res.status(204).end();
}

router.post(
  "/signal",
  limiteurSignal,
  express.json({ type: "*/*", limit: "4kb" }),
  corpsIllisible,
  async (req, res) => {
    /* On repond avant d'ecrire. Le navigateur n'attend rien de cette reponse,
       et la page d'accueil ne doit pas attendre la base de donnees pour
       continuer a s'afficher. */
    res.status(204).end();

    try {
      const signal = lireSignal(req.body);
      if (signal) await avecSchema(() => enregistrerSignal(signal));
    } catch (err) {
      console.warn("[AUDIENCE] signal non enregistre :", err.message);
    }
  }
);

/* ===== LA SYNTHÈSE =====
 * Reserve aux Admin +, comme le budget : meme chaine, meme refus « introuvable »
 * pour qui n'en est pas. */
const ADMIN_PLUS = [authMiddleware, requireAdmin, requireSuperAdmin];

router.get("/synthese", ...ADMIN_PLUS, async (req, res) => {
  try {
    res.json(await avecSchema(() => synthese(req.query)));
  } catch (err) {
    console.error("[AUDIENCE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/export.csv", ...ADMIN_PLUS, async (req, res) => {
  try {
    const data = await avecSchema(() => synthese(req.query));

    const champs = ["jour", "espace", "visites", "visiteurs", "nouveaux", "vues", "minutes", "duree_moyenne_s"];
    const lignes = [champs.join(";")];
    for (const l of data.par_jour) {
      lignes.push([
        l.jour,
        l.espace === "accueil" ? "Page d'accueil" : "Espace bénéficiaire",
        l.visites,
        l.visiteurs,
        l.nouveaux,
        l.vues,
        Math.round(l.secondes / 60),
        l.visites ? Math.round(l.secondes / l.visites) : 0,
      ].join(";"));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audience_${data.periode.du}_${data.periode.au}.csv"`
    );
    /* Le BOM pour qu'Excel reconnaisse l'UTF-8 : sans lui les accents
       arrivent casses, comme sur les autres exports de la plateforme. */
    res.send("﻿" + lignes.join("\r\n"));
  } catch (err) {
    console.error("[AUDIENCE] export :", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
