const express = require("express");
const rateLimit = require("express-rate-limit");
const Anthropic = require("@anthropic-ai/sdk");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requetes IA. Reessayez plus tard." },
});

router.use(authMiddleware, requireAdmin, aiLimiter);

function sanitizeText(value, max = 2000) {
  const str = String(value || "").trim();
  return str.slice(0, max);
}

async function getBusinessContext() {
  const now = new Date();
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [activitiesRes, participantsRes, socialRes, partnersRes, formsRes] =
    await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(duration_hours),0)::int AS hours
         FROM activities WHERE activity_date BETWEEN $1 AND $2`,
        [from, to]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM activity_participants ap
         JOIN activities a ON a.id = ap.activity_id
         WHERE a.activity_date BETWEEN $1 AND $2`,
        [from, to]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(followers),0)::bigint AS followers,
           COALESCE(SUM(engagement),0)::bigint AS engagement,
           COALESCE(SUM(reach),0)::bigint AS reach
         FROM social_media_kpis
         WHERE EXTRACT(YEAR FROM month_date) = $1`,
        [year]
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM partners WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status='active')::int AS actifs
                  FROM forms`),
    ]);

  return {
    year,
    totals: {
      activities: activitiesRes.rows[0]?.count || 0,
      hours: activitiesRes.rows[0]?.hours || 0,
      participants: participantsRes.rows[0]?.count || 0,
      social_followers: Number(socialRes.rows[0]?.followers || 0),
      social_engagement: Number(socialRes.rows[0]?.engagement || 0),
      social_reach: Number(socialRes.rows[0]?.reach || 0),
      partners_active: partnersRes.rows[0]?.count || 0,
      forms_total: formsRes.rows[0]?.total || 0,
      forms_actifs: formsRes.rows[0]?.actifs || 0,
    },
  };
}

function buildSystemPrompt(context) {
  const { year, totals } = context;
  return [
    "Tu es l'assistant interne de l'Orange Digital Center (ODC) Senegal.",
    "Tu aides le Chef de Projet Animation et l'equipe dans leurs operations quotidiennes.",
    "Tu reponds toujours en francais, de facon concise, claire et actionnable.",
    "Ne jamais inventer des chiffres. Si une info manque, dis-le clairement.",
    "Quand c'est utile, propose des recommandations ou une checklist en 3-6 points.",
    "Tu as acces aux KPI ODC en temps reel ci-dessous.",
    "",
    `=== KPI ODC ${year} (temps reel) ===`,
    `- Activites organisees : ${totals.activities}`,
    `- Heures de formation : ${totals.hours}h`,
    `- Participants beneficiaires : ${totals.participants}`,
    `- Partenaires actifs : ${totals.partners_active}`,
    `- Formulaires crees : ${totals.forms_total} (${totals.forms_actifs} actifs)`,
    `- Followers reseaux sociaux (total) : ${totals.social_followers.toLocaleString("fr-FR")}`,
    `- Engagement social (total) : ${totals.social_engagement.toLocaleString("fr-FR")}`,
    `- Reach social (total) : ${totals.social_reach.toLocaleString("fr-FR")}`,
  ].join("\n");
}

router.post("/chat", async (req, res) => {
  try {
    if (String(process.env.AI_ENABLED || "true") !== "true") {
      return res.status(503).json({ error: "Assistant IA desactive" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY manquante dans la configuration." });
    }

    const message = sanitizeText(req.body?.message, 2500);
    if (!message) {
      return res.status(400).json({ error: "Message requis" });
    }

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-8)
      .map((m) => ({ role: m.role, content: sanitizeText(m.content, 1500) }))
      .filter((m) => m.content);

    const context = await getBusinessContext();
    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: Number(process.env.AI_MAX_TOKENS || 1024),
      system: buildSystemPrompt(context),
      messages: [
        ...history,
        { role: "user", content: message },
      ],
    });

    const reply = response.content?.[0]?.text?.trim() ||
      "Je n'ai pas pu generer de reponse pour le moment.";

    await pool.query(
      `INSERT INTO ai_chat_logs
       (user_id, prompt, response, model_name, prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        req.user.id,
        message,
        reply,
        model,
        response.usage?.input_tokens || null,
        response.usage?.output_tokens || null,
        (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0) || null,
      ]
    );

    res.json({
      reply,
      meta: {
        model,
        usage: response.usage || null,
      },
    });
  } catch (err) {
    console.error("AI error:", err);
    const status = err?.status || 500;
    const msg = err?.message?.includes("API key") ? "Cle API Anthropic invalide." : "Erreur serveur IA";
    res.status(status >= 400 && status < 600 ? status : 500).json({ error: msg });
  }
});

module.exports = router;
