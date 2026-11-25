const express = require("express");
const pool = require("../db");
const { contreVerificationPrete } = require("../migrations/contreVerification");

/**
 * La page publique où un bénéficiaire répond « Oui, j'y étais » ou « Non ».
 *
 * Le lien de l'email ne vaut pas réponse : les messageries ouvrent les liens
 * pour les analyser, et un simple affichage enregistrerait des « oui » que
 * personne n'a donnés. La réponse part d'un clic sur la page (POST).
 *
 * Le jeton est la seule clé ; la page n'en dit pas plus que ce que l'email
 * disait déjà : le prénom, l'activité, sa date.
 */
const router = express.Router();
const JETON = /^[A-Za-z0-9_-]{20,64}$/;

async function trouver(jeton) {
  if (!JETON.test(String(jeton || ""))) return null;
  await contreVerificationPrete();
  const { rows } = await pool.query(
    `SELECT v.id, v.reponse, v.repondu_le, p.prenom, a.title, a.activity_date::text AS date,
            a.location, pr.name AS partenaire
       FROM verifications_beneficiaires v
       LEFT JOIN participants p ON p.id = v.participant_id
       LEFT JOIN activities a ON a.id = v.activity_id
       LEFT JOIN partners pr ON pr.id = v.partner_id
      WHERE v.jeton = $1`,
    [jeton]
  );
  return rows[0] || null;
}
const publique = (v) => ({
  prenom: v.prenom || "",
  activite: v.title || "",
  date: v.date,
  lieu: v.location || "",
  partenaire: v.partenaire || "",
  reponse: v.reponse,
});

router.get("/:jeton", async (req, res) => {
  try {
    const v = await trouver(req.params.jeton);
    if (!v) return res.status(404).json({ error: "Ce lien n'est pas valide." });
    res.json(publique(v));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* La première réponse fait foi : une vérification qu'on pourrait réécrire à
   volonté ne vérifierait rien. */
router.post("/:jeton", async (req, res) => {
  try {
    const reponse = req.body?.reponse;
    if (!["oui", "non"].includes(reponse)) return res.status(400).json({ error: "Réponse invalide." });
    const v = await trouver(req.params.jeton);
    if (!v) return res.status(404).json({ error: "Ce lien n'est pas valide." });
    const commentaire = String(req.body?.commentaire || "").trim().slice(0, 1000) || null;
    const { rows } = await pool.query(
      `UPDATE verifications_beneficiaires
          SET reponse = $1, repondu_le = NOW(), commentaire = $2
        WHERE id = $3 AND reponse IS NULL
        RETURNING reponse`,
      [reponse, commentaire, v.id]
    );
    if (!rows[0]) return res.status(409).json({ error: "Vous avez déjà répondu. Merci !", reponse: v.reponse });
    res.json({ ...publique(v), reponse });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
