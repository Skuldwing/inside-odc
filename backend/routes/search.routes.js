const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

/* Nombre de resultats par famille. La palette en affiche peu : on cherche a
   atteindre la bonne fiche, pas a parcourir une liste. */
const PER_GROUP = 5;
const MIN_LENGTH = 2;

/* Le cloisonnement reprend exactement celui des routes existantes :
   un partenaire ne voit que ses activites, un coach que les siennes.
   Toute nouvelle famille de resultats doit passer par ici. */
function activityScope(user, alias = "a") {
  if (user.role === "partner") {
    return { clause: `${alias}.partner_id = $LIMITME`, value: user.partner_id };
  }
  if (user.role === "coach") {
    return { clause: `${alias}.coach_id = $LIMITME`, value: user.id };
  }
  return null;
}

/* Construit la liste de parametres en substituant les marqueurs de position. */
function build(baseParams, scope) {
  const params = [...baseParams];
  let clause = "";
  if (scope) {
    params.push(scope.value);
    clause = scope.clause.replace("$LIMITME", `$${params.length}`);
  }
  return { params, clause };
}

router.get("/", authMiddleware, async (req, res) => {
  try {
    const raw = String(req.query.q || "").trim();
    if (raw.length < MIN_LENGTH) {
      return res.json({ query: raw, groups: [], truncated: false });
    }

    /* Echappe les jokers ILIKE pour qu'un "%" saisi par l'utilisateur soit
       cherche litteralement plutot que de tout ramener. */
    const needle = `%${raw.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const user = req.user;
    const isAdmin = user.role === "admin";

    /* L'acces Mbootay est relu en base : le jeton ne le porte pas. */
    let isTeamOdc = isAdmin;
    if (!isAdmin) {
      const r = await pool.query(
        "SELECT COALESCE(is_team_odc, false) AS ok FROM users WHERE id = $1",
        [user.id]
      );
      isTeamOdc = !!r.rows[0]?.ok;
    }

    const jobs = [];

    /* ── Activites ── */
    {
      const scope = activityScope(user, "a");
      const { params, clause } = build([needle], scope);
      jobs.push({
        type: "activite",
        label: "Activités",
        sql: `
          SELECT a.id, a.title, a.location,
                 to_char(a.activity_date, 'YYYY-MM-DD') AS activity_date,
                 p.name AS partner_name, d.name AS device_name
          FROM activities a
          LEFT JOIN partners p ON p.id = a.partner_id
          LEFT JOIN devices d ON d.id = a.device_id
          WHERE (a.title ILIKE $1 OR a.description ILIKE $1 OR a.location ILIKE $1)
            ${clause ? `AND ${clause}` : ""}
          ORDER BY a.activity_date DESC
          LIMIT ${PER_GROUP + 1}
        `,
        params,
        map: (r) => ({
          id: r.id,
          title: r.title,
          subtitle: [r.partner_name, r.device_name].filter(Boolean).join(" · ") || null,
          meta: r.activity_date || null,
          url: "/activities",
        }),
      });
    }

    /* ── Participants ── */
    {
      const scope = activityScope(user, "a");
      const { params, clause } = build([needle], scope);
      jobs.push({
        type: "participant",
        label: "Participants",
        sql: `
          SELECT DISTINCT ON (p.id)
                 p.id, p.nom, p.prenom, p.structure, p.email, a.title AS activity_title
          FROM participants p
          JOIN activity_participants ap ON ap.participant_id = p.id
          JOIN activities a ON a.id = ap.activity_id
          WHERE (p.nom ILIKE $1 OR p.prenom ILIKE $1 OR p.email ILIKE $1 OR p.structure ILIKE $1)
            ${clause ? `AND ${clause}` : ""}
          ORDER BY p.id, a.activity_date DESC
          LIMIT ${PER_GROUP + 1}
        `,
        params,
        map: (r) => ({
          id: r.id,
          title: [r.prenom, r.nom].filter(Boolean).join(" ") || "Sans nom",
          subtitle: r.structure || r.email || null,
          meta: r.activity_title || null,
          url: `/participants?q=${encodeURIComponent(raw)}`,
        }),
      });
    }

    /* ── Partenaires (admin) ── */
    if (isAdmin) {
      jobs.push({
        type: "partenaire",
        label: "Partenaires",
        sql: `
          SELECT id, name, description, contact_email, pipeline_stage
          FROM partners
          WHERE name ILIKE $1 OR description ILIKE $1 OR contact_email ILIKE $1
          ORDER BY name
          LIMIT ${PER_GROUP + 1}
        `,
        params: [needle],
        map: (r) => ({
          id: r.id,
          title: r.name,
          subtitle: r.contact_email || null,
          meta: r.pipeline_stage || null,
          url: `/partenaires/${r.id}`,
        }),
      });

      jobs.push({
        type: "dispositif",
        label: "Dispositifs",
        sql: `
          SELECT id, name, description, category
          FROM devices
          WHERE name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1
          ORDER BY name
          LIMIT ${PER_GROUP + 1}
        `,
        params: [needle],
        map: (r) => ({
          id: r.id,
          title: r.name,
          subtitle: r.category || null,
          meta: null,
          url: "/dispositifs",
        }),
      });

      jobs.push({
        type: "formulaire",
        label: "Formulaires",
        sql: `
          SELECT id, title, description, slug, status
          FROM forms
          WHERE title ILIKE $1 OR description ILIKE $1 OR slug ILIKE $1
          ORDER BY updated_at DESC NULLS LAST
          LIMIT ${PER_GROUP + 1}
        `,
        params: [needle],
        map: (r) => ({
          id: r.id,
          title: r.title,
          subtitle: r.description || null,
          meta: r.status || null,
          url: `/formulaires/${r.id}/edit`,
        }),
      });

      jobs.push({
        type: "utilisateur",
        label: "Utilisateurs",
        sql: `
          SELECT u.id, u.full_name, u.email, u.role, p.name AS partner_name
          FROM users u
          LEFT JOIN partners p ON p.id = u.partner_id
          WHERE (u.full_name ILIKE $1 OR u.email ILIKE $1)
            AND (u.is_active IS DISTINCT FROM false)
          ORDER BY u.full_name NULLS LAST
          LIMIT ${PER_GROUP + 1}
        `,
        params: [needle],
        map: (r) => ({
          id: r.id,
          title: r.full_name || r.email,
          subtitle: r.email,
          meta: r.partner_name || r.role,
          url: `/utilisateurs?q=${encodeURIComponent(raw)}`,
        }),
      });
    }

    /* ── Projets Mbootay (equipe ODC) ── */
    if (isTeamOdc) {
      jobs.push({
        type: "projet",
        label: "Projets Mbootay",
        sql: `
          SELECT pr.id, pr.title, pr.description, pr.status, u.full_name AS owner_name
          FROM mbootay_projects pr
          LEFT JOIN users u ON u.id = pr.owner_id
          WHERE pr.title ILIKE $1 OR pr.description ILIKE $1
          ORDER BY pr.created_at DESC
          LIMIT ${PER_GROUP + 1}
        `,
        params: [needle],
        map: (r) => ({
          id: r.id,
          title: r.title,
          subtitle: r.owner_name || null,
          meta: r.status || null,
          url: `/mbootay/${r.id}`,
        }),
      });
    }

    /* Une famille en echec (table absente sur un environnement plus ancien,
       par exemple) ne doit pas faire tomber toute la recherche. */
    const settled = await Promise.allSettled(
      jobs.map((j) => pool.query(j.sql, j.params))
    );

    const groups = [];
    let truncated = false;

    settled.forEach((result, i) => {
      const job = jobs[i];
      if (result.status !== "fulfilled") {
        console.error(`[SEARCH] ${job.type}:`, result.reason?.message);
        return;
      }
      const rows = result.value.rows;
      if (rows.length === 0) return;
      const hasMore = rows.length > PER_GROUP;
      if (hasMore) truncated = true;
      groups.push({
        type: job.type,
        label: job.label,
        has_more: hasMore,
        items: rows.slice(0, PER_GROUP).map(job.map),
      });
    });

    res.json({ query: raw, groups, truncated });
  } catch (err) {
    console.error("[SEARCH]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
