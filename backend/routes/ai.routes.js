const express = require("express");
const rateLimit = require("express-rate-limit");
const OpenAI = require("openai");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_MAX || 50),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requetes IA. Reessayez plus tard." },
});

router.use(authMiddleware, requireAdmin, aiLimiter);

function sanitizeText(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

/* ============================================================
   OUTILS — format OpenAI function calling (Gemini compatible)
   ============================================================ */

const TOOLS = [
  /* ── Lecture données ── */
  {
    type: "function",
    function: {
      name: "get_kpis",
      description: "Retourne les KPI globaux ODC pour une période : activités, participants, heures de formation, KPI sociaux (followers, engagement, reach), partenaires actifs.",
      parameters: {
        type: "object",
        properties: {
          year:  { type: "integer", description: "Année (ex: 2025). Défaut: année en cours." },
          month: { type: "integer", description: "Mois 1-12 pour un mois précis. Optionnel." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_activities",
      description: "Liste les activités avec détails (titre, date, partenaire, dispositif, participants, heures). Filtre par période ou partenaire.",
      parameters: {
        type: "object",
        properties: {
          year:       { type: "integer", description: "Année. Défaut: en cours." },
          month:      { type: "integer", description: "Mois 1-12. Optionnel." },
          partner_id: { type: "string",  description: "UUID partenaire. Optionnel." },
          limit:      { type: "integer", description: "Max résultats (défaut 20, max 50)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_participants",
      description: "Liste les participants avec profil (nom, genre, structure, tranche d'âge) et activité associée. Filtre par activité, partenaire ou genre.",
      parameters: {
        type: "object",
        properties: {
          activity_id: { type: "string",  description: "UUID activité. Optionnel." },
          partner_id:  { type: "string",  description: "UUID partenaire. Optionnel." },
          genre:       { type: "string",  description: "'H' pour hommes, 'F' pour femmes. Optionnel." },
          year:        { type: "integer", description: "Année. Optionnel." },
          month:       { type: "integer", description: "Mois 1-12. Optionnel." },
          limit:       { type: "integer", description: "Max résultats (défaut 30, max 100)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trends",
      description: "Évolution mensuelle des activités et bénéficiaires sur une année entière, mois par mois.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "integer", description: "Année. Défaut: en cours." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_partners",
      description: "Liste les partenaires actifs avec leur objectif annuel de bénéficiaires et le nombre réalisé.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "integer", description: "Année. Défaut: en cours." },
        },
      },
    },
  },
  /* ── Prédiction & analyse ── */
  {
    type: "function",
    function: {
      name: "predict_year_end",
      description: "Projette les totaux de fin d'année (participants, activités) basé sur la moyenne des mois déjà écoulés. Permet de savoir si l'ODC est en bonne voie pour atteindre ses objectifs.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "integer", description: "Année à projeter. Défaut: en cours." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description: "Compare deux périodes (ex: cette année vs l'an dernier, ce mois vs le précédent). Retourne valeurs et évolutions en pourcentage.",
      parameters: {
        type: "object",
        properties: {
          year1:  { type: "integer", description: "Première année." },
          month1: { type: "integer", description: "Mois pour la période 1. Optionnel (= toute l'année)." },
          year2:  { type: "integer", description: "Deuxième année." },
          month2: { type: "integer", description: "Mois pour la période 2. Optionnel." },
        },
        required: ["year1", "year2"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_objectives_status",
      description: "Suivi détaillé des objectifs annuels de chaque partenaire : réalisé, pourcentage d'atteinte, statut (en retard / en bonne voie / atteint) et projection fin d'année.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "integer", description: "Année. Défaut: en cours." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_activities",
      description: "Top des activités les plus fréquentées sur une période, classées par nombre de participants.",
      parameters: {
        type: "object",
        properties: {
          year:  { type: "integer", description: "Année. Défaut: en cours." },
          month: { type: "integer", description: "Mois 1-12. Optionnel." },
          limit: { type: "integer", description: "Nombre de résultats (défaut 5, max 20)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_demographics",
      description: "Analyse démographique des participants : répartition par tranche d'âge, statut (étudiant, entrepreneur, salarié...) et genre.",
      parameters: {
        type: "object",
        properties: {
          year:  { type: "integer", description: "Année. Défaut: en cours." },
          month: { type: "integer", description: "Mois 1-12. Optionnel." },
        },
      },
    },
  },
  /* ── Actions ── */
  {
    type: "function",
    function: {
      name: "draft_campaign",
      description: "Crée un brouillon de campagne email dans le système. L'utilisateur le retrouve dans la page Campagnes pour le réviser et l'envoyer.",
      parameters: {
        type: "object",
        properties: {
          name:            { type: "string", description: "Nom de la campagne (ex: 'Bilan T2 2025')." },
          subject:         { type: "string", description: "Sujet de l'email." },
          html_body:       { type: "string", description: "Corps HTML de l'email. Rédige un HTML propre et professionnel." },
          recipients_type: { type: "string", description: "'all_participants' pour tous les participants. Défaut: 'all_participants'." },
        },
        required: ["name", "subject", "html_body"],
      },
    },
  },
  /* ── Mémoire inter-sessions ── */
  {
    type: "function",
    function: {
      name: "save_insight",
      description: "Mémorise une analyse, observation ou alerte importante pour la retrouver lors de futures conversations. Utilise cet outil quand tu détectes quelque chose de significatif.",
      parameters: {
        type: "object",
        properties: {
          content:  { type: "string", description: "Contenu de l'analyse à mémoriser." },
          category: { type: "string", description: "Catégorie : 'performance', 'alerte', 'prediction', ou 'observation'." },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_insights",
      description: "Récupère les analyses et observations mémorisées lors de sessions précédentes.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Nombre d'analyses à récupérer (défaut 5, max 20)." },
        },
      },
    },
  },
];

/* ============================================================
   EXÉCUTION DES OUTILS
   ============================================================ */

async function executeTool(name, args, userId) {
  const now = new Date();
  const year  = args.year  || now.getFullYear();
  const month = args.month || null;
  const limit = Math.min(args.limit || 20, 100);

  function dateRange(y, m) {
    if (m) {
      const lastDay = new Date(y, m, 0).getDate();
      return {
        from: `${y}-${String(m).padStart(2, "0")}-01`,
        to:   `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }

  const { from, to } = dateRange(year, month);

  /* ── get_kpis ── */
  if (name === "get_kpis") {
    const [actRes, partRes, socialRes, partnersRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS activities, COALESCE(SUM(duration_hours),0)::int AS hours
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
         FROM social_media_kpis WHERE EXTRACT(YEAR FROM month_date) = $1`, [year]
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

  /* ── get_activities ── */
  if (name === "get_activities") {
    const params = [from, to];
    let where = "a.activity_date BETWEEN $1 AND $2";
    if (args.partner_id) { where += ` AND a.partner_id = $${params.length + 1}`; params.push(args.partner_id); }

    const res = await pool.query(`
      SELECT a.id, a.title, a.activity_date, a.location, a.duration_hours,
             COALESCE(p.name, 'Non renseigne') AS partenaire,
             COALESCE(d.name, 'Non renseigne') AS dispositif,
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

  /* ── get_participants ── */
  if (name === "get_participants") {
    const params = [];
    const conditions = [];
    if (args.year || args.month) {
      conditions.push(`a.activity_date BETWEEN $${params.length+1} AND $${params.length+2}`);
      params.push(from, to);
    }
    if (args.activity_id) { conditions.push(`a.id = $${params.length+1}`); params.push(args.activity_id); }
    if (args.partner_id)  { conditions.push(`a.partner_id = $${params.length+1}`); params.push(args.partner_id); }
    if (args.genre)       { conditions.push(`p.genre = $${params.length+1}`); params.push(args.genre); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await pool.query(`
      SELECT p.nom, p.prenom, p.genre, p.age_range, p.structure, p.statut,
             a.title AS activite, a.activity_date, pr.name AS partenaire
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

  /* ── get_trends ── */
  if (name === "get_trends") {
    const res = await pool.query(`
      WITH months AS (
        SELECT generate_series(date_trunc('month', $1::date), date_trunc('month', $2::date), '1 month') AS m
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

  /* ── get_partners ── */
  if (name === "get_partners") {
    const res = await pool.query(`
      SELECT pr.name, pr.objective_beneficiaries,
             COUNT(DISTINCT a.id)::int AS nb_activites,
             COUNT(ap.participant_id)::int AS nb_participants
      FROM partners pr
      LEFT JOIN activities a ON a.partner_id = pr.id AND a.activity_date BETWEEN $1 AND $2
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      WHERE pr.status = 'active'
      GROUP BY pr.id, pr.name, pr.objective_beneficiaries
      ORDER BY nb_participants DESC
    `, [from, to]);
    return { annee: year, partenaires: res.rows };
  }

  /* ── predict_year_end ── */
  if (name === "predict_year_end") {
    const res = await pool.query(`
      WITH monthly AS (
        SELECT
          EXTRACT(MONTH FROM a.activity_date)::int AS m,
          COUNT(DISTINCT a.id) AS activites,
          COUNT(ap.participant_id) AS participants
        FROM activities a
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        WHERE EXTRACT(YEAR FROM a.activity_date) = $1
          AND a.activity_date < date_trunc('month', CURRENT_DATE)
        GROUP BY 1
      )
      SELECT
        COUNT(*)::int AS mois_complets,
        ROUND(AVG(activites)::numeric, 1) AS moy_activites,
        ROUND(AVG(participants)::numeric, 0)::int AS moy_participants,
        COALESCE(SUM(activites), 0)::int AS activites_ytd,
        COALESCE(SUM(participants), 0)::int AS participants_ytd
      FROM monthly
    `, [year]);

    const row = res.rows[0];
    const mois_complets  = row.mois_complets || 0;
    const mois_restants  = 12 - mois_complets;
    const moy_participants = Number(row.moy_participants) || 0;
    const moy_activites    = Number(row.moy_activites)    || 0;

    return {
      annee: year,
      mois_complets,
      mois_restants,
      realise: {
        activites:    row.activites_ytd,
        participants: row.participants_ytd,
      },
      moyenne_mensuelle: {
        activites:    Number(row.moy_activites),
        participants: moy_participants,
      },
      projection_fin_annee: {
        activites:    row.activites_ytd + Math.round(moy_activites * mois_restants),
        participants: row.participants_ytd + Math.round(moy_participants * mois_restants),
      },
    };
  }

  /* ── compare_periods ── */
  if (name === "compare_periods") {
    const { year1, month1 = null, year2, month2 = null } = args;
    const r1 = dateRange(year1, month1);
    const r2 = dateRange(year2, month2);

    async function fetchKpis(r) {
      const [actRes, partRes] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS activites, COALESCE(SUM(duration_hours),0)::int AS heures
           FROM activities WHERE activity_date BETWEEN $1 AND $2`, [r.from, r.to]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS participants,
                  COUNT(*) FILTER (WHERE p.genre='H')::int AS hommes,
                  COUNT(*) FILTER (WHERE p.genre='F')::int AS femmes
           FROM activity_participants ap
           JOIN activities a ON a.id = ap.activity_id
           JOIN participants p ON p.id = ap.participant_id
           WHERE a.activity_date BETWEEN $1 AND $2`, [r.from, r.to]
        ),
      ]);
      return {
        activites:    actRes.rows[0].activites,
        heures:       actRes.rows[0].heures,
        participants: partRes.rows[0].participants,
        hommes:       partRes.rows[0].hommes,
        femmes:       partRes.rows[0].femmes,
      };
    }

    const [k1, k2] = await Promise.all([fetchKpis(r1), fetchKpis(r2)]);

    function pct(a, b) {
      if (!b) return null;
      return Math.round((a - b) / b * 100);
    }

    return {
      periode1: {
        label: month1 ? `${String(month1).padStart(2, "0")}/${year1}` : `${year1}`,
        ...k1,
      },
      periode2: {
        label: month2 ? `${String(month2).padStart(2, "0")}/${year2}` : `${year2}`,
        ...k2,
      },
      evolution: {
        activites:    { valeur: k1.activites    - k2.activites,    pct: pct(k1.activites,    k2.activites)    },
        participants: { valeur: k1.participants  - k2.participants, pct: pct(k1.participants, k2.participants) },
        heures:       { valeur: k1.heures        - k2.heures,       pct: pct(k1.heures,       k2.heures)       },
      },
    };
  }

  /* ── get_objectives_status ── */
  if (name === "get_objectives_status") {
    const currentMonth = new Date().getMonth() + 1;
    const moisEcoules  = year === now.getFullYear() ? Math.max(currentMonth - 1, 1) : 12;
    const moisRestants = 12 - moisEcoules;

    const res = await pool.query(`
      SELECT
        pr.name AS partenaire,
        COALESCE(pr.objective_beneficiaries, 0) AS objectif,
        COUNT(DISTINCT ap.participant_id)::int AS realise,
        COUNT(DISTINCT a.id)::int AS nb_activites
      FROM partners pr
      LEFT JOIN activities a ON a.partner_id = pr.id AND a.activity_date BETWEEN $1 AND $2
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      WHERE pr.status = 'active'
      GROUP BY pr.id, pr.name, pr.objective_beneficiaries
      ORDER BY realise DESC
    `, [from, to]);

    const partenaires = res.rows.map(p => {
      const objectif = Number(p.objectif);
      const realise  = Number(p.realise);
      const pct_atteint = objectif > 0 ? Math.round(realise / objectif * 100) : null;
      const moy_mensuelle = realise / moisEcoules;
      const projection = Math.round(realise + moy_mensuelle * moisRestants);

      let statut = "pas d'objectif defini";
      if (pct_atteint !== null) {
        statut = pct_atteint >= 100 ? "objectif atteint" : pct_atteint >= 75 ? "en bonne voie" : pct_atteint >= 50 ? "a surveiller" : "en retard";
      }

      return {
        partenaire:           p.partenaire,
        nb_activites:         p.nb_activites,
        objectif,
        realise,
        pct_atteint,
        projection_fin_annee: objectif > 0 ? projection : null,
        statut,
      };
    });

    return { annee: year, mois_ecoules: moisEcoules, partenaires };
  }

  /* ── get_top_activities ── */
  if (name === "get_top_activities") {
    const topLimit = Math.min(args.limit || 5, 20);
    const res = await pool.query(`
      SELECT a.title, a.activity_date, a.location,
             COALESCE(p.name, 'Non renseigne') AS partenaire,
             COALESCE(d.name, 'Non renseigne') AS dispositif,
             COUNT(ap.participant_id)::int AS nb_participants
      FROM activities a
      LEFT JOIN partners p ON p.id = a.partner_id
      LEFT JOIN devices d ON d.id = a.device_id
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      WHERE a.activity_date BETWEEN $1 AND $2
      GROUP BY a.id, a.title, a.activity_date, a.location, p.name, d.name
      ORDER BY nb_participants DESC
      LIMIT $3
    `, [from, to, topLimit]);
    return {
      periode: month ? `${String(month).padStart(2, "0")}/${year}` : `${year}`,
      activites: res.rows,
    };
  }

  /* ── get_demographics ── */
  if (name === "get_demographics") {
    const [ageRes, statutRes] = await Promise.all([
      pool.query(`
        SELECT COALESCE(p.age_range, 'Non renseigne') AS tranche_age,
               p.genre,
               COUNT(*)::int AS nb
        FROM participants p
        JOIN activity_participants ap ON ap.participant_id = p.id
        JOIN activities a ON a.id = ap.activity_id
        WHERE a.activity_date BETWEEN $1 AND $2
        GROUP BY p.age_range, p.genre
        ORDER BY nb DESC
      `, [from, to]),
      pool.query(`
        SELECT COALESCE(p.statut, 'Non renseigne') AS statut,
               COUNT(*)::int AS nb
        FROM participants p
        JOIN activity_participants ap ON ap.participant_id = p.id
        JOIN activities a ON a.id = ap.activity_id
        WHERE a.activity_date BETWEEN $1 AND $2
        GROUP BY p.statut
        ORDER BY nb DESC
        LIMIT 10
      `, [from, to]),
    ]);
    return {
      periode:         month ? `${String(month).padStart(2, "0")}/${year}` : `${year}`,
      par_tranche_age: ageRes.rows,
      par_statut:      statutRes.rows,
    };
  }

  /* ── draft_campaign ── */
  if (name === "draft_campaign") {
    const { name: campName, subject, html_body, recipients_type = "all_participants" } = args;
    if (!campName || !subject || !html_body) {
      return { error: "name, subject et html_body sont requis." };
    }
    const res = await pool.query(`
      INSERT INTO campagnes (name, subject, html_body, recipients_type, send_mode)
      VALUES ($1, $2, $3, $4, 'publipostage')
      RETURNING id, name
    `, [
      campName.slice(0, 255),
      subject.slice(0, 500),
      html_body.slice(0, 50000),
      recipients_type,
    ]);
    return {
      success: true,
      message: `Brouillon "${res.rows[0].name}" cree avec succes. Retrouvez-le dans la page Campagnes pour le reviser et l'envoyer.`,
      campaign_id: res.rows[0].id,
    };
  }

  /* ── save_insight ── */
  if (name === "save_insight") {
    const { content, category = "observation" } = args;
    if (!content) return { error: "Le contenu est requis." };
    const validCats = ["performance", "alerte", "prediction", "observation"];
    const cat = validCats.includes(category) ? category : "observation";
    await pool.query(
      `INSERT INTO ai_insights (user_id, content, category) VALUES ($1, $2, $3)`,
      [userId, content.slice(0, 5000), cat]
    );
    return { success: true, message: "Analyse memorisee." };
  }

  /* ── get_insights ── */
  if (name === "get_insights") {
    const insightLimit = Math.min(args.limit || 5, 20);
    const res = await pool.query(
      `SELECT content, category, to_char(created_at, 'DD/MM/YYYY') AS date
       FROM ai_insights
       ORDER BY created_at DESC
       LIMIT $1`,
      [insightLimit]
    );
    return { insights: res.rows };
  }

  return { error: `Outil inconnu: ${name}` };
}

/* ============================================================
   SYSTEM PROMPT
   ============================================================ */

function buildSystemPrompt() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.toLocaleString("fr-FR", { month: "long" });
  return [
    "Tu es Pobarr, l'assistant interne de l'Orange Digital Center (ODC) Senegal.",
    "Tu aides l'equipe de gestion dans leurs operations quotidiennes et la prise de decision.",
    "Tu reponds toujours en francais.",
    "",
    "IMPORTANT — quand utiliser les outils :",
    "- N'utilise les outils QUE si l'utilisateur demande explicitement des donnees, chiffres, statistiques, analyses ou actions.",
    "- Pour une salutation, question generale ou message de conversation simple, reponds normalement SANS appeler aucun outil.",
    "- Exemples : 'salut', 'merci', 'comment ca va', 'que peux-tu faire ?' → reponse directe, pas d'outil.",
    "- Exemples : 'combien de participants ?', 'resume les KPI', 'compare 2024 et 2025' → utilise les outils.",
    "",
    "Tes capacites (a presenter si on te le demande) :",
    "- Lecture donnees en temps reel : activites, participants, KPI, tendances, partenaires",
    "- Predictions et projections : projection fin d'annee, suivi objectifs, comparaison periodes",
    "- Analyse demographique : tranches d'age, statuts, genres",
    "- Creer des brouillons de campagne email directement dans le systeme",
    "- Memoriser des analyses importantes entre les sessions",
    "",
    "Regles :",
    "- Utilise les outils pour repondre aux questions sur les donnees — ne jamais inventer des chiffres.",
    "- Sois concis et clair. Formate en listes ou tableaux quand c'est utile.",
    "- Pour les analyses importantes, utilise save_insight pour les memoriser.",
    `Aujourd'hui : ${month} ${year}.`,
  ].join("\n");
}

/* ============================================================
   ROUTE /chat — boucle tool use (format OpenAI / Gemini)
   ============================================================ */

router.post("/chat", async (req, res) => {
  try {
    if (String(process.env.AI_ENABLED || "true") !== "true") {
      return res.status(503).json({ error: "Assistant IA desactive" });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "GROQ_API_KEY manquante dans la configuration." });
    }

    const message = sanitizeText(req.body?.message, 2500);
    if (!message) return res.status(400).json({ error: "Message requis" });

    const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = rawHistory
      .filter((m) => m && (m.role === "user" || m.role === "assistant"))
      .slice(-10)
      .map((m) => ({ role: m.role, content: sanitizeText(m.content, 2000) }))
      .filter((m) => m.content);

    const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const messages = [
      { role: "system", content: buildSystemPrompt() },
      ...history,
      { role: "user", content: message },
    ];

    async function callGemini(msgs) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await client.chat.completions.create({
            model,
            messages: msgs,
            tools: TOOLS,
            tool_choice: "auto",
            parallel_tool_calls: false,
            max_tokens: Number(process.env.AI_MAX_TOKENS || 2048),
          });
        } catch (err) {
          if (err?.status === 429 && attempt < 2) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
            continue;
          }
          throw err;
        }
      }
    }

    let reply = "";
    let iterations = 0;

    /* Boucle tool use — max 6 tours */
    while (iterations < 6) {
      iterations++;

      const response = await callGemini(messages);
      const choice = response.choices[0];

      if (choice.finish_reason === "stop") {
        reply = choice.message.content?.trim() || "";
        break;
      }

      if (choice.finish_reason === "tool_calls") {
        messages.push(choice.message);

        const toolResults = [];
        for (const toolCall of choice.message.tool_calls || []) {
          let result;
          try {
            const args = JSON.parse(toolCall.function.arguments || "{}");
            result = await executeTool(toolCall.function.name, args, req.user.id);
          } catch (err) {
            result = { error: `Erreur lors de l'execution de ${toolCall.function.name}: ${err.message}` };
          }
          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
        messages.push(...toolResults);
        continue;
      }

      reply = choice.message?.content?.trim() || "Je n'ai pas pu generer de reponse.";
      break;
    }

    if (!reply) reply = "Je n'ai pas pu generer de reponse apres plusieurs tentatives.";

    await pool.query(
      `INSERT INTO ai_chat_logs (user_id, prompt, response, model_name, prompt_tokens, completion_tokens, total_tokens)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.id, message, reply, model, 0, 0, 0]
    ).catch(() => {});

    res.json({ reply, meta: { model } });

  } catch (err) {
    console.error("Pobarr error:", err);
    const status = err?.status >= 400 && err?.status < 600 ? err.status : 500;
    const msg    = err?.status === 429 ? "Limite de requetes atteinte. Reessayez dans quelques secondes."
                 : err?.status === 401 ? "Cle API Groq invalide."
                 : "Erreur serveur IA";
    res.status(status).json({ error: msg });
  }
});

module.exports = router;
