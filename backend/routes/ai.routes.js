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
  return String(value || "").trim().slice(0, max);
}

/* ============================================================
   OUTILS — fonctions que Pobarr peut appeler
   ============================================================ */

const TOOLS = [
  {
    name: "get_kpis",
    description: "Retourne les KPI globaux ODC pour une période donnée : nombre d'activités, participants/bénéficiaires, heures de formation, KPI sociaux (followers, engagement, reach), partenaires actifs.",
    input_schema: {
      type: "object",
      properties: {
        year:  { type: "integer", description: "Année (ex: 2025). Défaut: année en cours." },
        month: { type: "integer", description: "Mois 1-12 pour filtrer un mois précis. Optionnel." },
      },
    },
  },
  {
    name: "get_activities",
    description: "Liste les activités avec leurs détails : titre, date, partenaire, dispositif, nombre de participants, heures. Permet de filtrer par période, partenaire ou dispositif.",
    input_schema: {
      type: "object",
      properties: {
        year:       { type: "integer", description: "Année. Défaut: année en cours." },
        month:      { type: "integer", description: "Mois 1-12. Optionnel." },
        partner_id: { type: "string",  description: "UUID du partenaire pour filtrer. Optionnel." },
        limit:      { type: "integer", description: "Nombre max de résultats (défaut: 20, max: 50)." },
      },
    },
  },
  {
    name: "get_participants",
    description: "Liste les participants/bénéficiaires avec leur profil (nom, genre, structure, tranche d'âge) et l'activité associée. Peut filtrer par activité, partenaire ou genre.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: { type: "string",  description: "UUID d'une activité précise. Optionnel." },
        partner_id:  { type: "string",  description: "UUID d'un partenaire. Optionnel." },
        genre:       { type: "string",  description: "'H' pour hommes, 'F' pour femmes. Optionnel." },
        year:        { type: "integer", description: "Année. Optionnel." },
        month:       { type: "integer", description: "Mois 1-12. Optionnel." },
        limit:       { type: "integer", description: "Nombre max (défaut: 30, max: 100)." },
      },
    },
  },
  {
    name: "get_trends",
    description: "Retourne l'évolution mensuelle des activités et bénéficiaires sur une année, mois par mois.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "Année. Défaut: année en cours." },
      },
    },
  },
  {
    name: "get_partners",
    description: "Liste les partenaires actifs avec leur objectif de bénéficiaires et le nombre réalisé.",
    input_schema: {
      type: "object",
      properties: {
        year: { type: "integer", description: "Année pour le calcul des réalisés. Défaut: année en cours." },
      },
    },
  },
];

/* ============================================================
   EXÉCUTION DES OUTILS
   ============================================================ */

async function executeTool(name, input) {
  const now = new Date();
  const year  = input.year  || now.getFullYear();
  const month = input.month || null;
  const limit = Math.min(input.limit || 20, 100);

  let from, to;
  if (month) {
    const lastDay = new Date(year, month, 0).getDate();
    from = `${year}-${String(month).padStart(2, "0")}-01`;
    to   = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  } else {
    from = `${year}-01-01`;
    to   = `${year}-12-31`;
  }

  if (name === "get_kpis") {
    const [actRes, partRes, socialRes, partnersRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS activities,
                COALESCE(SUM(duration_hours),0)::int AS hours
         FROM activities WHERE activity_date BETWEEN $1 AND $2`, [from, to]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS participants,
                COUNT(*) FILTER (WHERE p.genre='H')::int AS hommes,
                COUNT(*) FILTER (WHERE p.genre='F')::int AS femmes
         FROM activity_participants ap
         JOIN activities a ON a.id = ap.activity_id
         JOIN participants p ON p.id = ap.participant_id
         WHERE a.activity_date BETWEEN $1 AND $2`, [from, to]
      ),
      pool.query(
        `SELECT COALESCE(SUM(followers),0)::bigint AS followers,
                COALESCE(SUM(engagement),0)::bigint AS engagement,
                COALESCE(SUM(reach),0)::bigint AS reach
         FROM social_media_kpis
         WHERE EXTRACT(YEAR FROM month_date) = $1`, [year]
      ),
      pool.query(`SELECT COUNT(*)::int AS count FROM partners WHERE status='active'`),
    ]);
    return {
      periode: month ? `${String(month).padStart(2, "0")}/${year}` : `${year}`,
      activites: actRes.rows[0].activities,
      heures_formation: actRes.rows[0].hours,
      participants_total: partRes.rows[0].participants,
      participants_hommes: partRes.rows[0].hommes,
      participants_femmes: partRes.rows[0].femmes,
      partenaires_actifs: partnersRes.rows[0].count,
      social: {
        followers: Number(socialRes.rows[0].followers),
        engagement: Number(socialRes.rows[0].engagement),
        reach: Number(socialRes.rows[0].reach),
      },
    };
  }

  if (name === "get_activities") {
    const params = [from, to];
    let where = "a.activity_date BETWEEN $1 AND $2";
    if (input.partner_id) { where += ` AND a.partner_id = $${params.length + 1}`; params.push(input.partner_id); }

    const res = await pool.query(`
      SELECT a.id, a.title, a.activity_date, a.location,
             a.duration_hours,
             COALESCE(p.name, 'Non renseigné') AS partenaire,
             COALESCE(d.name, 'Non renseigné') AS dispositif,
             COUNT(ap.participant_id)::int AS nb_participants
      FROM activities a
      LEFT JOIN partners p ON p.id = a.partner_id
      LEFT JOIN devices d ON d.id = a.device_id
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      WHERE ${where}
      GROUP BY a.id, a.title, a.activity_date, a.location, a.duration_hours, p.name, d.name
      ORDER BY a.activity_date DESC
      LIMIT $${params.length + 1}
    `, [...params, limit]);
    return { total: res.rowCount, activites: res.rows };
  }

  if (name === "get_participants") {
    const params = [];
    const conditions = [];

    if (input.year || input.month) {
      conditions.push(`a.activity_date BETWEEN $${params.length+1} AND $${params.length+2}`);
      params.push(from, to);
    }
    if (input.activity_id) { conditions.push(`a.id = $${params.length+1}`); params.push(input.activity_id); }
    if (input.partner_id)  { conditions.push(`a.partner_id = $${params.length+1}`); params.push(input.partner_id); }
    if (input.genre)       { conditions.push(`p.genre = $${params.length+1}`); params.push(input.genre); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await pool.query(`
      SELECT p.nom, p.prenom, p.genre, p.age_range, p.structure, p.statut,
             a.title AS activite, a.activity_date,
             pr.name AS partenaire
      FROM participants p
      JOIN activity_participants ap ON ap.participant_id = p.id
      JOIN activities a ON a.id = ap.activity_id
      LEFT JOIN partners pr ON pr.id = a.partner_id
      ${where}
      ORDER BY a.activity_date DESC, p.nom
      LIMIT $${params.length + 1}
    `, [...params, limit]);
    return { total: res.rowCount, participants: res.rows };
  }

  if (name === "get_trends") {
    const res = await pool.query(`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', $1::date),
          date_trunc('month', $2::date),
          '1 month'
        ) AS m
      ),
      agg AS (
        SELECT date_trunc('month', a.activity_date) AS m,
               COUNT(DISTINCT a.id)::int AS activites,
               COUNT(ap.participant_id)::int AS participants
        FROM activities a
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        WHERE a.activity_date BETWEEN $1 AND $2
        GROUP BY 1
      )
      SELECT to_char(months.m, 'YYYY-MM') AS mois,
             COALESCE(agg.activites, 0) AS activites,
             COALESCE(agg.participants, 0) AS participants
      FROM months
      LEFT JOIN agg ON agg.m = months.m
      ORDER BY months.m
    `, [from, to]);
    return { annee: year, tendances: res.rows };
  }

  if (name === "get_partners") {
    const res = await pool.query(`
      SELECT pr.name, pr.objective_beneficiaries,
             COUNT(DISTINCT a.id)::int AS nb_activites,
             COUNT(ap.participant_id)::int AS nb_participants
      FROM partners pr
      LEFT JOIN activities a ON a.partner_id = pr.id
        AND a.activity_date BETWEEN $1 AND $2
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      WHERE pr.status = 'active'
      GROUP BY pr.id, pr.name, pr.objective_beneficiaries
      ORDER BY nb_participants DESC
    `, [from, to]);
    return { annee: year, partenaires: res.rows };
  }

  return { error: `Outil inconnu: ${name}` };
}

/* ============================================================
   SYSTEM PROMPT
   ============================================================ */

function buildSystemPrompt() {
  const year = new Date().getFullYear();
  return [
    "Tu es Pobarr, l'assistant interne de l'Orange Digital Center (ODC) Sénégal.",
    "Tu aides l'équipe de gestion dans leurs opérations quotidiennes.",
    "Tu réponds toujours en français, de façon concise, claire et actionnable.",
    "Tu as accès à des outils pour interroger les données en temps réel : activités, participants, KPI, tendances, partenaires.",
    "Utilise TOUJOURS les outils disponibles pour répondre aux questions sur les données — ne jamais inventer ou estimer des chiffres.",
    "Si une information n'est pas disponible via les outils, dis-le clairement.",
    "Quand c'est utile, formate les résultats sous forme de liste ou tableau en texte.",
    "Sois proactif : si l'utilisateur demande un résumé, utilise les outils nécessaires et synthétise les résultats.",
    `Année en cours : ${year}.`,
  ].join("\n");
}

/* ============================================================
   ROUTE /chat avec boucle tool use
   ============================================================ */

router.post("/chat", async (req, res) => {
  try {
    if (String(process.env.AI_ENABLED || "true") !== "true") {
      return res.status(503).json({ error: "Assistant IA désactivé" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "ANTHROPIC_API_KEY manquante dans la configuration." });
    }

    const message = sanitizeText(req.body?.message, 2500);
    if (!message) return res.status(400).json({ error: "Message requis" });

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-10)
      .map((m) => ({ role: m.role, content: sanitizeText(m.content, 2000) }))
      .filter((m) => m.content);

    const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
    const client = new Anthropic({ apiKey });

    const messages = [...history, { role: "user", content: message }];

    let reply = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let iterations = 0;

    /* Boucle tool use — max 5 tours */
    while (iterations < 5) {
      iterations++;
      const response = await client.messages.create({
        model,
        max_tokens: Number(process.env.AI_MAX_TOKENS || 2048),
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages,
      });

      totalInputTokens  += response.usage?.input_tokens  || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;

      if (response.stop_reason === "end_turn") {
        reply = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        break;
      }

      if (response.stop_reason === "tool_use") {
        /* Ajouter la réponse assistant avec les tool_use blocks */
        messages.push({ role: "assistant", content: response.content });

        /* Exécuter tous les outils demandés */
        const toolResults = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          let result;
          try {
            result = await executeTool(block.name, block.input || {});
          } catch (err) {
            result = { error: `Erreur lors de l'exécution de ${block.name}: ${err.message}` };
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      /* stop_reason inattendu */
      reply = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "Je n'ai pas pu générer de réponse.";
      break;
    }

    if (!reply) reply = "Je n'ai pas pu générer de réponse après plusieurs tentatives.";

    /* Log */
    await pool.query(
      `INSERT INTO ai_chat_logs
       (user_id, prompt, response, model_name, prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.id, message, reply, model, totalInputTokens, totalOutputTokens, totalInputTokens + totalOutputTokens]
    ).catch(() => {});

    res.json({ reply, meta: { model, usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } } });

  } catch (err) {
    console.error("Pobarr error:", err);
    const status = err?.status >= 400 && err?.status < 600 ? err.status : 500;
    const msg = err?.message?.includes("API key") ? "Clé API Anthropic invalide." : "Erreur serveur IA";
    res.status(status).json({ error: msg });
  }
});

module.exports = router;
