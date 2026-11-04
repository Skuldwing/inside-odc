const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireTeamOdc = require("../middleware/teamOdc.middleware");
const { logAudit } = require("../services/audit");

const router = express.Router();

router.use(authMiddleware, requireTeamOdc);

const PROJECT_STATUSES = ["non_demarre", "en_cours", "en_pause", "termine"];
const TASK_STATUSES = ["a_faire", "en_cours", "en_pause", "termine", "annule"];
const TASK_PRIORITIES = ["basse", "normale", "haute"];

/* ===== ANNUAIRE DE L'ÉQUIPE =====
   La route /users est réservée aux admins (avec PIN) : Mbootay expose donc sa
   propre liste, limitée aux profils internes pouvant porter un projet ou une tâche. */
router.get("/team", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, COALESCE(is_team_odc, false) AS is_team_odc
       FROM users
       WHERE role <> 'partner'
         AND (is_active IS DISTINCT FROM false)
         AND (role = 'admin' OR COALESCE(is_team_odc, false) = true)
       ORDER BY full_name NULLS LAST, email`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== RÉFÉRENTIELS (rattachement d'un projet) ===== */
router.get("/references", async (req, res) => {
  try {
    const [partners, devices] = await Promise.all([
      pool.query("SELECT id, name FROM partners ORDER BY name"),
      pool.query("SELECT id, name FROM devices ORDER BY name"),
    ]);
    res.json({ partners: partners.rows, devices: devices.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== LISTE DES PROJETS ===== */
router.get("/projects", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
             u.full_name AS owner_name,
             pa.name AS partner_name,
             d.name AS device_name,
             COALESCE(t.total, 0)::int AS tasks_total,
             COALESCE(t.done, 0)::int  AS tasks_done,
             COALESCE(m.members_count, 0)::int AS members_count,
             COALESCE(pm.members, '[]'::json) AS members
      FROM mbootay_projects p
      LEFT JOIN users u ON u.id = p.owner_id
      LEFT JOIN partners pa ON pa.id = p.partner_id
      LEFT JOIN devices d ON d.id = p.device_id
      LEFT JOIN (
        SELECT project_id,
               COUNT(*) FILTER (WHERE status <> 'annule') AS total,
               COUNT(*) FILTER (WHERE status = 'termine') AS done
        FROM mbootay_tasks GROUP BY project_id
      ) t ON t.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS members_count
        FROM mbootay_members GROUP BY project_id
      ) m ON m.project_id = p.id
      LEFT JOIN (
        SELECT mm.project_id,
               json_agg(json_build_object('id', mu.id, 'full_name', mu.full_name, 'role', mu.role)
                        ORDER BY mu.full_name NULLS LAST) AS members
        FROM mbootay_members mm
        JOIN users mu ON mu.id = mm.user_id
        GROUP BY mm.project_id
      ) pm ON pm.project_id = p.id

      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DÉTAIL D'UN PROJET ===== */
router.get("/projects/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.full_name AS owner_name, pa.name AS partner_name, d.name AS device_name
       FROM mbootay_projects p
       LEFT JOIN users u ON u.id = p.owner_id
       LEFT JOIN partners pa ON pa.id = p.partner_id
       LEFT JOIN devices d ON d.id = p.device_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Projet introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CRÉER UN PROJET ===== */
router.post("/projects", async (req, res) => {
  try {
    const { title, description = null, status = "en_cours", owner_id = null,
            partner_id = null, device_id = null, start_date = null, due_date = null } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });
    const resolvedStatus = PROJECT_STATUSES.includes(status) ? status : "en_cours";

    const result = await pool.query(
      `INSERT INTO mbootay_projects
       (title, description, status, owner_id, partner_id, device_id, start_date, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title.trim(), description, resolvedStatus, owner_id || null, partner_id || null,
       device_id || null, start_date || null, due_date || null, req.user.id]
    );

    const created = result.rows[0];
    logAudit(req, "CREATE", "mbootay_projects", created.id, created.title, { status: created.status });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MODIFIER UN PROJET ===== */
router.put("/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description = null, status = "en_cours", owner_id = null,
            partner_id = null, device_id = null, start_date = null, due_date = null } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });
    const resolvedStatus = PROJECT_STATUSES.includes(status) ? status : "en_cours";

    const result = await pool.query(
      `UPDATE mbootay_projects
       SET title = $1, description = $2, status = $3, owner_id = $4,
           partner_id = $5, device_id = $6, start_date = $7, due_date = $8
       WHERE id = $9 RETURNING *`,
      [title.trim(), description, resolvedStatus, owner_id || null, partner_id || null,
       device_id || null, start_date || null, due_date || null, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Projet introuvable" });

    const updated = result.rows[0];
    logAudit(req, "UPDATE", "mbootay_projects", updated.id, updated.title, { status: updated.status });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SUPPRIMER UN PROJET ===== */
router.delete("/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const before = await pool.query("SELECT title FROM mbootay_projects WHERE id = $1", [id]);
    const result = await pool.query("DELETE FROM mbootay_projects WHERE id = $1 RETURNING id", [id]);
    if (!result.rows.length) return res.status(404).json({ error: "Projet introuvable" });

    logAudit(req, "DELETE", "mbootay_projects", id, before.rows[0]?.title ?? null, {});
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MEMBRES DU PROJET ===== */
router.get("/projects/:id/members", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role
       FROM mbootay_members m JOIN users u ON u.id = m.user_id
       WHERE m.project_id = $1 ORDER BY u.full_name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/projects/:id/members", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_ids = [] } = req.body;

    await pool.query("DELETE FROM mbootay_members WHERE project_id = $1", [id]);
    if (user_ids.length > 0) {
      const values = user_ids.map((_, i) => `($1, $${i + 2})`).join(", ");
      await pool.query(
        `INSERT INTO mbootay_members (project_id, user_id) VALUES ${values}`,
        [id, ...user_ids]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== TÂCHES ===== */
router.get("/projects/:id/tasks", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name AS assigned_name
       FROM mbootay_tasks t LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.project_id = $1
       ORDER BY t.position ASC, t.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/projects/:id/tasks", async (req, res) => {
  try {
    const { title, description = null, status = "a_faire", priority = "normale",
            assigned_to = null, due_date = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });

    const result = await pool.query(
      `INSERT INTO mbootay_tasks
       (project_id, title, description, status, priority, assigned_to, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.params.id,
        title.trim(),
        description,
        TASK_STATUSES.includes(status) ? status : "a_faire",
        TASK_PRIORITIES.includes(priority) ? priority : "normale",
        assigned_to || null,
        due_date || null,
        req.user.id,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/tasks/:taskId", async (req, res) => {
  try {
    const { title, description = null, status = "a_faire", priority = "normale",
            assigned_to = null, due_date = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });

    const resolvedStatus = TASK_STATUSES.includes(status) ? status : "a_faire";
    const result = await pool.query(
      `UPDATE mbootay_tasks
       SET title = $1, description = $2, status = $3, priority = $4,
           assigned_to = $5, due_date = $6,
           completed_at = CASE WHEN $3 = 'termine' THEN COALESCE(completed_at, NOW()) ELSE NULL END
       WHERE id = $7 RETURNING *`,
      [
        title.trim(),
        description,
        resolvedStatus,
        TASK_PRIORITIES.includes(priority) ? priority : "normale",
        assigned_to || null,
        due_date || null,
        req.params.taskId,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Tâche introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Déplacement Kanban : change uniquement le statut (et l'ordre dans la colonne) */
router.patch("/tasks/:taskId/status", async (req, res) => {
  try {
    const { status, position = 0 } = req.body;
    if (!TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: "Statut invalide" });
    }
    const result = await pool.query(
      `UPDATE mbootay_tasks
       SET status = $1, position = $2,
           completed_at = CASE WHEN $1 = 'termine' THEN COALESCE(completed_at, NOW()) ELSE NULL END
       WHERE id = $3 RETURNING *`,
      [status, position, req.params.taskId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Tâche introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/tasks/:taskId", async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM mbootay_tasks WHERE id = $1 RETURNING id",
      [req.params.taskId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Tâche introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ORDRE DU JOUR HEBDOMADAIRE PARTAGÉ ===== */
router.get("/weekly-plans", async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) {
      return res.status(400).json({ error: "Période invalide" });
    }
    const plans = await pool.query(
      `SELECT id, week_start FROM mbootay_weekly_plans
       WHERE week_start >= $1::date AND week_start <= $2::date
       ORDER BY week_start`,
      [from, to]
    );
    if (!plans.rows.length) return res.json([]);
    const items = await pool.query(
      `SELECT id, plan_id, parent_id, title, done, position
       FROM mbootay_weekly_items WHERE plan_id = ANY($1::int[])
       ORDER BY position, id`,
      [plans.rows.map((plan) => plan.id)]
    );
    const byPlan = new Map(plans.rows.map((plan) => [plan.id, { ...plan, items: [] }]));
    const byItem = new Map();
    items.rows.forEach((item) => {
      const entry = { ...item, children: [] };
      byItem.set(item.id, entry);
      const plan = byPlan.get(item.plan_id);
      if (!item.parent_id) plan?.items.push(entry);
      else byItem.get(item.parent_id)?.children.push(entry);
    });
    res.json([...byPlan.values()]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/weekly-plans/:weekStart/items", async (req, res) => {
  try {
    const { weekStart } = req.params;
    const { title, parent_id = null } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({ error: "Semaine invalide" });
    if (!title?.trim()) return res.status(400).json({ error: "Le titre du point est requis" });

    const plan = await pool.query(
      `INSERT INTO mbootay_weekly_plans (week_start, created_by)
       VALUES ($1::date, $2)
       ON CONFLICT (week_start) DO UPDATE SET week_start = EXCLUDED.week_start
       RETURNING id`,
      [weekStart, req.user.id]
    );
    if (parent_id) {
      const parent = await pool.query(
        `SELECT id FROM mbootay_weekly_items
         WHERE id = $1 AND plan_id = $2 AND parent_id IS NULL`,
        [parent_id, plan.rows[0].id]
      );
      if (!parent.rows.length) return res.status(400).json({ error: "Grand point introuvable pour cette semaine" });
    }
    const result = await pool.query(
      `INSERT INTO mbootay_weekly_items (plan_id, parent_id, title, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, plan_id, parent_id, title, done, position`,
      [plan.rows[0].id, parent_id || null, title.trim(), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/weekly-items/:itemId", async (req, res) => {
  try {
    const { done } = req.body;
    if (typeof done !== "boolean") return res.status(400).json({ error: "État de checklist invalide" });
    const result = await pool.query(
      `UPDATE mbootay_weekly_items SET done = $1 WHERE id = $2
       RETURNING id, plan_id, parent_id, title, done, position`,
      [done, req.params.itemId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Point introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/weekly-items/:itemId", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM mbootay_weekly_items WHERE id = $1 RETURNING id", [req.params.itemId]);
    if (!result.rows.length) return res.status(404).json({ error: "Point introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MES TÂCHES (toutes projets confondus) ===== */
router.get("/my-tasks", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, p.title AS project_title
       FROM mbootay_tasks t JOIN mbootay_projects p ON p.id = t.project_id
       WHERE t.assigned_to = $1 AND t.status NOT IN ('termine', 'annule')
       ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
