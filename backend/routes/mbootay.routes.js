const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireTeamOdc = require("../middleware/teamOdc.middleware");
const { logAudit } = require("../services/audit");
/* Prévenir celui à qui on confie quelque chose. Aucune de ces fonctions n'est
   attendue : un service d'envoi en panne ne doit pas empêcher de créer un
   projet. Les règles — jamais à soi-même, jamais sans changement réel — sont
   en tête de services/mbootayNotifications.js. */
const {
  notifierPiloteProjet, notifierNouveauxMembres, notifierTacheAssignee,
} = require("../services/mbootayNotifications");

const router = express.Router();

router.use(authMiddleware, requireTeamOdc);

const PROJECT_STATUSES = ["non_demarre", "en_cours", "en_pause", "termine"];
const TASK_STATUSES = ["a_faire", "en_cours", "en_pause", "termine", "annule"];
const TASK_PRIORITIES = ["basse", "normale", "haute"];

let checklistSchemaPromise;
async function ensureChecklistSchema() {
  if (!checklistSchemaPromise) {
    checklistSchemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS mbootay_checklist_tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'a_faire' CHECK (status IN ('a_faire','en_cours','en_pause','termine','annule')),
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        due_date DATE,
        position INTEGER NOT NULL DEFAULT 0,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      )
    `).catch((err) => {
      checklistSchemaPromise = null;
      throw err;
    });
  }
  await checklistSchemaPromise;
}

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
    /* Le pilote est prévenu — sauf si c'est celui qui vient de créer le projet,
       ce qui est le cas le plus courant. */
    notifierPiloteProjet({ projet: created, auteurId: req.user.id, nouveau: true });
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

    /* Le pilote d'avant, pour ne prévenir que si on en change réellement.
       Sans cette lecture, corriger une date d'échéance renverrait un message
       « vous pilotez ce projet » à quelqu'un qui le pilote depuis un mois. */
    const avant = await pool.query(
      "SELECT owner_id FROM mbootay_projects WHERE id = $1", [id]
    );
    const pilotePrecedent = avant.rows[0]?.owner_id ?? null;

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
    if (Number(updated.owner_id) !== Number(pilotePrecedent)) {
      notifierPiloteProjet({ projet: updated, auteurId: req.user.id, nouveau: false });
    }
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
  /* L'écran envoie la liste complète, pas les ajouts : la mise à jour efface
     puis réécrit. Deux conséquences traitées ici.

     D'abord la transaction. L'effacement et la réécriture étaient deux ordres
     séparés : si le second échouait — un identifiant qui n'existe plus, une
     coupure réseau — l'équipe du projet était perdue, et la réponse d'erreur
     ne disait pas qu'elle venait de l'être. Les deux ne font plus qu'un.

     Ensuite la comparaison. Pour ne prévenir que les nouveaux venus, il faut
     savoir qui était déjà là : sans cela, cocher une case de plus renverrait
     un message à toute l'équipe. */
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { user_ids = [] } = req.body;
    const voulus = [...new Set(user_ids.map(Number).filter(Number.isInteger))];

    await client.query("BEGIN");

    const avant = await client.query(
      "SELECT user_id FROM mbootay_members WHERE project_id = $1", [id]
    );
    const dejaLa = new Set(avant.rows.map((r) => Number(r.user_id)));

    await client.query("DELETE FROM mbootay_members WHERE project_id = $1", [id]);
    if (voulus.length > 0) {
      const values = voulus.map((_, i) => `($1, $${i + 2})`).join(", ");
      await client.query(
        `INSERT INTO mbootay_members (project_id, user_id) VALUES ${values}`,
        [id, ...voulus]
      );
    }

    await client.query("COMMIT");

    const ajoutes = voulus.filter((u) => !dejaLa.has(u));
    if (ajoutes.length) {
      const projet = await pool.query(
        `SELECT p.id, p.title, p.status, p.due_date, u.full_name AS owner_name
           FROM mbootay_projects p
           LEFT JOIN users u ON u.id = p.owner_id
          WHERE p.id = $1`,
        [id]
      );
      if (projet.rows.length) {
        notifierNouveauxMembres({
          projet: projet.rows[0], ajoutes, auteurId: req.user.id,
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
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

    const creee = result.rows[0];
    if (creee.assigned_to) {
      const projet = await pool.query(
        "SELECT id, title FROM mbootay_projects WHERE id = $1", [req.params.id]
      );
      notifierTacheAssignee({
        tache: creee, projet: projet.rows[0], auteurId: req.user.id,
      });
    }
    res.status(201).json(creee);
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

    /* À qui elle était confiée avant : on ne prévient que si cela change.
       Corriger l'intitulé d'une tâche ne doit pas la réannoncer à celui qui
       l'a déjà sur sa liste. */
    const avant = await pool.query(
      "SELECT assigned_to FROM mbootay_tasks WHERE id = $1", [req.params.taskId]
    );
    const assignePrecedent = avant.rows[0]?.assigned_to ?? null;

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

    const modifiee = result.rows[0];
    if (Number(modifiee.assigned_to) !== Number(assignePrecedent)) {
      const projet = await pool.query(
        "SELECT id, title FROM mbootay_projects WHERE id = $1", [modifiee.project_id]
      );
      notifierTacheAssignee({
        tache: modifiee, projet: projet.rows[0], auteurId: req.user.id,
      });
    }
    res.json(modifiee);
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

/* ===== CHECKLIST GÉNÉRALE (tâches autonomes, sans projet) ===== */
router.get("/checklist", async (req, res) => {
  try {
    await ensureChecklistSchema();
    const result = await pool.query(
      `SELECT t.*, u.full_name AS assigned_name, u.email AS assigned_email
       FROM mbootay_checklist_tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       ORDER BY t.position ASC, t.due_date ASC NULLS LAST, t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[MBOOTAY CHECKLIST]", err);
    res.status(500).json({ error: "Impossible de charger la checklist" });
  }
});

router.post("/checklist", async (req, res) => {
  try {
    await ensureChecklistSchema();
    const { title, description = null, status = "a_faire", assigned_to = null, due_date = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });
    const resolvedStatus = TASK_STATUSES.includes(status) ? status : "a_faire";
    const result = await pool.query(
      `INSERT INTO mbootay_checklist_tasks
       (title, description, status, assigned_to, due_date, created_by, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $3 = 'termine' THEN NOW() ELSE NULL END)
       RETURNING *`,
      [title.trim(), description, resolvedStatus, assigned_to || null, due_date || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[MBOOTAY CHECKLIST]", err);
    res.status(500).json({ error: "Impossible d'ajouter cette tâche" });
  }
});

router.put("/checklist/:taskId", async (req, res) => {
  try {
    await ensureChecklistSchema();
    const { title, description = null, status = "a_faire", assigned_to = null, due_date = null } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });
    const resolvedStatus = TASK_STATUSES.includes(status) ? status : "a_faire";
    const result = await pool.query(
      `UPDATE mbootay_checklist_tasks
       SET title = $1, description = $2, status = $3, assigned_to = $4, due_date = $5,
           completed_at = CASE WHEN $3 = 'termine' THEN COALESCE(completed_at, NOW()) ELSE NULL END
       WHERE id = $6 RETURNING *`,
      [title.trim(), description, resolvedStatus, assigned_to || null, due_date || null, req.params.taskId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Tâche introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[MBOOTAY CHECKLIST]", err);
    res.status(500).json({ error: "Impossible de modifier cette tâche" });
  }
});

router.patch("/checklist/:taskId/status", async (req, res) => {
  try {
    await ensureChecklistSchema();
    const { status } = req.body;
    if (!TASK_STATUSES.includes(status)) return res.status(400).json({ error: "Statut invalide" });
    const result = await pool.query(
      `UPDATE mbootay_checklist_tasks
       SET status = $1, completed_at = CASE WHEN $1 = 'termine' THEN COALESCE(completed_at, NOW()) ELSE NULL END
       WHERE id = $2 RETURNING *`,
      [status, req.params.taskId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Tâche introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[MBOOTAY CHECKLIST]", err);
    res.status(500).json({ error: "Impossible de mettre à jour le statut" });
  }
});

router.delete("/checklist/:taskId", async (req, res) => {
  try {
    await ensureChecklistSchema();
    const result = await pool.query("DELETE FROM mbootay_checklist_tasks WHERE id = $1 RETURNING id", [req.params.taskId]);
    if (!result.rows.length) return res.status(404).json({ error: "Tâche introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error("[MBOOTAY CHECKLIST]", err);
    res.status(500).json({ error: "Impossible de supprimer cette tâche" });
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
      `SELECT id, plan_id, parent_id, title, done, event_date, position
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
    const { title, parent_id = null, event_date = null } = req.body;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return res.status(400).json({ error: "Semaine invalide" });
    if (!title?.trim()) return res.status(400).json({ error: "Le titre du point est requis" });
    if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return res.status(400).json({ error: "Date invalide" });

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
      `INSERT INTO mbootay_weekly_items (plan_id, parent_id, title, event_date, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, plan_id, parent_id, title, done, event_date, position`,
      [plan.rows[0].id, parent_id || null, title.trim(), event_date, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/weekly-items/:itemId", async (req, res) => {
  try {
    const { done, title, event_date } = req.body;
    if (typeof done !== "boolean" && typeof title !== "string" && event_date === undefined) {
      return res.status(400).json({ error: "Aucune modification fournie" });
    }
    if (title !== undefined && !title.trim()) return res.status(400).json({ error: "Le titre du point est requis" });
    if (event_date && !/^\d{4}-\d{2}-\d{2}$/.test(event_date)) return res.status(400).json({ error: "Date invalide" });
    const result = await pool.query(
      `UPDATE mbootay_weekly_items SET
         done = COALESCE($1, done),
         title = COALESCE($2, title),
         event_date = CASE WHEN $4 THEN $3::date ELSE event_date END
       WHERE id = $5
       RETURNING id, plan_id, parent_id, title, done, event_date, position`,
      [typeof done === "boolean" ? done : null, title === undefined ? null : title.trim(), event_date || null, event_date !== undefined, req.params.itemId]
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
