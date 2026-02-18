const express = require("express");
const rateLimit = require("express-rate-limit");
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
  if (!str) return "";
  return str.slice(0, max);
}

async function getBusinessContext() {
  const now = new Date();
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const [activitiesRes, participantsRes, socialRes, partnersRes] =
    await Promise.all([
      pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM activities
        WHERE activity_date BETWEEN $1 AND $2
        `,
        [from, to]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM activity_participants ap
        JOIN activities a ON a.id = ap.activity_id
        WHERE a.activity_date BETWEEN $1 AND $2
        `,
        [from, to]
      ),
      pool.query(
        `
        SELECT
          COALESCE(SUM(followers), 0)::bigint AS followers,
          COALESCE(SUM(engagement), 0)::bigint AS engagement
        FROM social_media_kpis
        WHERE EXTRACT(YEAR FROM month_date) = $1
        `,
        [year]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM partners
        WHERE status = 'active'
        `
      ),
    ]);

  return {
    year,
    totals: {
      activities: activitiesRes.rows[0]?.count || 0,
      participants: participantsRes.rows[0]?.count || 0,
      social_followers_sum: Number(socialRes.rows[0]?.followers || 0),
      social_engagement_sum: Number(socialRes.rows[0]?.engagement || 0),
      partners_active: partnersRes.rows[0]?.count || 0,
    },
  };
}

function systemPrompt(context) {
  return [
    "Tu es l'assistant interne ODC pour les operations et la transformation digitale.",
    "Tu reponds en francais, de facon concise et actionnable.",
    "Tu ne dois pas inventer des donnees. Si une info manque, dis-le clairement.",
    "Quand c'est pertinent, propose une checklist operationnelle en 3 a 6 points.",
    `Contexte KPI ODC annee ${context.year}:`,
    `- Activites: ${context.totals.activities}`,
    `- Participants lies aux activites: ${context.totals.participants}`,
    `- Partners actifs: ${context.totals.partners_active}`,
    `- Social followers (somme annuelle): ${context.totals.social_followers_sum}`,
    `- Social engagement (somme annuelle): ${context.totals.social_engagement_sum}`,
  ].join("\n");
}

router.post("/chat", async (req, res) => {
  try {
    if (String(process.env.AI_ENABLED || "true") !== "true") {
      return res.status(503).json({ error: "Assistant IA desactive" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "OPENAI_API_KEY manquante" });
    }

    const message = sanitizeText(req.body?.message, 2500);
    if (!message) {
      return res.status(400).json({ error: "Message requis" });
    }

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-8)
      .map((m) => ({
        role: m.role,
        content: sanitizeText(m.content, 1500),
      }))
      .filter((m) => m.content);

    const context = await getBusinessContext();
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: Number(process.env.AI_TEMPERATURE || 0.2),
        max_tokens: Number(process.env.AI_MAX_TOKENS || 600),
        messages: [
          { role: "system", content: systemPrompt(context) },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("AI provider error:", body);
      return res.status(502).json({ error: "Erreur fournisseur IA" });
    }

    const data = await response.json();
    const reply =
      data?.choices?.[0]?.message?.content?.trim() ||
      "Je n'ai pas pu generer de reponse pour le moment.";

    await pool.query(
      `
      INSERT INTO ai_chat_logs
      (user_id, prompt, response, model_name, prompt_tokens, completion_tokens, total_tokens)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        req.user.id,
        message,
        reply,
        model,
        data?.usage?.prompt_tokens || null,
        data?.usage?.completion_tokens || null,
        data?.usage?.total_tokens || null,
      ]
    );

    res.json({
      reply,
      meta: {
        model,
        usage: data?.usage || null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur IA" });
  }
});

module.exports = router;
