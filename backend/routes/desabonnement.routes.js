const express = require("express");
const { emailDuJeton, desabonner, reabonner, estDesabonne } = require("../services/desabonnement");
const { ensureCampagnesSchema, estSchemaManquant } = require("../migrations/campagnesSchema");

const router = express.Router();

/**
 * Desabonnement public.
 *
 * Sans authentification, volontairement : quelqu'un qui ne veut plus recevoir
 * nos messages n'a pas de compte et n'a aucune raison d'en creer un. Le jeton
 * signe tient lieu de preuve — il ne permet que de retirer une adresse, jamais
 * de lire quoi que ce soit.
 *
 * La page est servie par l'API et non par le site : elle doit fonctionner meme
 * si le front est indisponible, et le POST « un clic » de Gmail arrive ici
 * directement, sans navigateur.
 */

const ECHAPPER = (v) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function page({ titre, message, action = "" }) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${ECHAPPER(titre)}</title>
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#f8fafc; color:#0f172a;
         font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; padding:24px }
  .carte { background:#fff; border:1px solid #e2e8f0; border-radius:20px;
           padding:32px; max-width:480px; box-shadow:0 10px 30px rgba(15,23,42,.06) }
  h1 { font-size:20px; margin:0 0 12px }
  p  { font-size:15px; line-height:1.65; color:#475569; margin:0 0 12px }
  .marque { font-size:12px; letter-spacing:.08em; text-transform:uppercase;
            color:#f97316; font-weight:600; margin-bottom:16px }
  button { font:inherit; background:#0f172a; color:#fff; border:0; border-radius:12px;
           padding:10px 18px; cursor:pointer; margin-top:8px }
  button:hover { background:#1e293b }
  .fin { font-size:13px; color:#94a3b8; margin-top:20px }
</style></head>
<body><main class="carte">
  <div class="marque">Inside ODC Sénégal</div>
  <h1>${ECHAPPER(titre)}</h1>
  <p>${message}</p>
  ${action}
  <p class="fin">Inside ODC — plateforme de gestion du centre.</p>
</main></body></html>`;
}

/* Gmail appelle cette adresse en POST, sans interaction, des que le
   destinataire touche « Se desabonner ». Il n'attend qu'un 200 : aucune page
   n'est affichee, aucune confirmation ne doit etre demandee. */
router.post("/:jeton", async (req, res) => {
  const email = emailDuJeton(req.params.jeton);
  if (!email) return res.status(400).json({ error: "Lien invalide" });
  try {
    await desabonner(email, { motif: "demande du destinataire", origine: "un-clic" });
    res.json({ success: true });
  } catch (err) {
    if (estSchemaManquant(err)) {
      await ensureCampagnesSchema();
      await desabonner(email, { motif: "demande du destinataire", origine: "un-clic" });
      return res.json({ success: true });
    }
    console.error("[DESABONNEMENT]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Le lien clique dans le message. Le desabonnement est effectif des
   l'ouverture — demander une confirmation supplementaire est precisement ce
   que les regles de fevrier 2024 interdisent. Le retour en arriere reste
   offert pour le cas d'un clic involontaire. */
router.get("/:jeton", async (req, res) => {
  const email = emailDuJeton(req.params.jeton);
  if (!email) {
    return res.status(400).type("html").send(
      page({
        titre: "Lien invalide",
        message:
          "Ce lien de désabonnement n'est pas reconnu. Il a peut-être été tronqué par votre messagerie. Répondez simplement au message reçu et nous retirerons votre adresse.",
      })
    );
  }

  try {
    const deja = await estDesabonne(email);
    if (!deja) await desabonner(email, { motif: "demande du destinataire", origine: "lien" });

    res.type("html").send(
      page({
        titre: deja ? "Vous étiez déjà désabonné" : "C'est fait",
        message: `L'adresse <strong>${ECHAPPER(email)}</strong> ne recevra plus les campagnes d'information d'Inside ODC Sénégal. Les messages liés à vos inscriptions — convocations, attestations — continuent de vous parvenir.`,
        action: `<form method="post" action="reabonnement/${ECHAPPER(req.params.jeton)}">
                   <button type="submit">Je me suis trompé, me réabonner</button>
                 </form>`,
      })
    );
  } catch (err) {
    if (estSchemaManquant(err)) {
      await ensureCampagnesSchema().catch(() => {});
      return res.redirect(req.originalUrl);
    }
    console.error("[DESABONNEMENT]", err);
    res.status(500).type("html").send(
      page({
        titre: "Une erreur est survenue",
        message: "Votre demande n'a pas pu être enregistrée. Réessayez dans quelques instants.",
      })
    );
  }
});

router.post("/reabonnement/:jeton", async (req, res) => {
  const email = emailDuJeton(req.params.jeton);
  if (!email) return res.status(400).type("html").send(page({ titre: "Lien invalide", message: "Ce lien n'est pas reconnu." }));
  try {
    await reabonner(email);
    res.type("html").send(
      page({
        titre: "Vous êtes de nouveau abonné",
        message: `L'adresse <strong>${ECHAPPER(email)}</strong> recevra de nouveau nos informations. Vous pourrez vous désabonner à tout moment depuis le pied de n'importe quel message.`,
      })
    );
  } catch (err) {
    console.error("[REABONNEMENT]", err);
    res.status(500).type("html").send(page({ titre: "Une erreur est survenue", message: "Réessayez dans quelques instants." }));
  }
});

module.exports = router;
