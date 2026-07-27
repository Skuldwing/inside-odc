const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

const DEFAULTS = {
  welcome: {
    slug: "welcome",
    label: "Bienvenue (création de compte)",
    description: "Envoyé automatiquement quand un admin crée un nouveau compte utilisateur.",
    subject: "Votre accès Inside ODC",
    body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#FF6600;padding:20px;text-align:center">
    <h2 style="color:#fff;margin:0">Orange Digital Center</h2>
  </div>
  <div style="padding:24px">
    <p>Bonjour {{nom}},</p>
    <p>Votre compte a été créé sur Inside ODC.</p>
    <p><strong>Email :</strong> {{email}}</p>
    <p><a href="{{lien}}" style="display:inline-block;background:#FF6600;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Définir mon mot de passe</a></p>
    <p style="color:#64748B;font-size:13px">Ce lien est valable 24h.</p>
  </div>
</div>`,
    variables: ["{{nom}}", "{{email}}", "{{lien}}"],
  },
  reset_password: {
    slug: "reset_password",
    label: "Réinitialisation du mot de passe",
    description: "Envoyé quand un admin déclenche un reset depuis la page Utilisateurs.",
    subject: "Réinitialisation de votre mot de passe Inside ODC",
    body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#FF6600;padding:20px;text-align:center">
    <h2 style="color:#fff;margin:0">Orange Digital Center</h2>
  </div>
  <div style="padding:24px">
    <p>Bonjour {{nom}},</p>
    <p>Un lien de réinitialisation a été demandé pour votre compte Inside ODC.</p>
    <p><a href="{{lien}}" style="display:inline-block;background:#FF6600;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Réinitialiser mon mot de passe</a></p>
    <p style="color:#64748B;font-size:13px">Ce lien est valable 24h.</p>
  </div>
</div>`,
    variables: ["{{nom}}", "{{lien}}"],
  },
  attestation: {
    slug: "attestation",
    label: "Attestation de participation",
    description: "Envoyé avec le PDF quand l'admin clique ✉ sur une activité.",
    subject: "Attestation de participation — {{activite}}",
    body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#FF6600;padding:20px;text-align:center">
    <h2 style="color:#fff;margin:0">Orange Digital Center Sénégal</h2>
  </div>
  <div style="padding:24px">
    <p>Bonjour {{nom}},</p>
    <p>Veuillez trouver ci-joint votre attestation de participation à l'activité :</p>
    <p style="background:#FFF3E0;border-left:4px solid #FF6600;padding:12px;font-weight:bold">{{activite}}</p>
    <p>Nous vous remercions de votre participation et espérons vous revoir prochainement.</p>
    <p style="color:#64748B;font-size:13px">— L'équipe Orange Digital Center Sénégal</p>
  </div>
</div>`,
    variables: ["{{nom}}", "{{activite}}", "{{date}}", "{{partenaire}}", "{{dispositif}}", "{{duree}}"],
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
      };
    }
  } catch {}
  return DEFAULTS[slug] || null;
}

function renderTemplate(html, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{{${k}}}`).join(v || ""),
    html
  );
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

module.exports = { router, getTemplate, renderTemplate };
