const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const requireAdminPin = require("../middleware/pin.middleware");
const { logAudit } = require("../services/audit");

const router = express.Router();

/* ===== GET ALL PARTNERS ===== */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.*,
        COUNT(DISTINCT a.id)::int AS activities_count,
        COUNT(ap.participant_id)::int AS beneficiaries_count,
        COALESCE((
          SELECT SUM(u.objective_beneficiaries)
          FROM users u
          WHERE u.partner_id = p.id AND u.role = 'coach' AND u.objective_beneficiaries IS NOT NULL
        ), 0)::int AS coaches_objective_allocated,
        (
          SELECT COUNT(*)
          FROM users u
          WHERE u.partner_id = p.id AND u.role = 'coach'
        )::int AS coaches_count
      FROM partners p
      LEFT JOIN activities a ON a.partner_id = p.id
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      GROUP BY p.id
      ORDER BY p.name
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET ONE PARTNER ===== */
router.get("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.*,
        COUNT(DISTINCT a.id)::int AS activities_count,
        COUNT(ap.participant_id)::int AS beneficiaries_count
      FROM partners p
      LEFT JOIN activities a ON a.partner_id = p.id
      LEFT JOIN activity_participants ap ON ap.activity_id = a.id
      WHERE p.id = $1
      GROUP BY p.id
      `,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Partenaire introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== TIMELINE (activités + notes + tâches + changements de statut) ===== */
router.get("/:id/timeline", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [activitiesRes, notesRes, tasksRes, stageChangesRes] = await Promise.all([
      pool.query(
        `SELECT id, title, activity_date AS date, reliability_score, reliability_status
         FROM activities WHERE partner_id = $1 ORDER BY activity_date DESC`,
        [id]
      ),
      pool.query(
        `SELECT pn.id, pn.content, pn.created_at AS date, u.full_name AS author_name
         FROM partner_notes pn LEFT JOIN users u ON u.id = pn.author_id
         WHERE pn.partner_id = $1 ORDER BY pn.created_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT pt.id, pt.title, pt.due_date, pt.completed, pt.completed_at, pt.created_at AS date,
                u.full_name AS assigned_name
         FROM partner_tasks pt LEFT JOIN users u ON u.id = pt.assigned_to
         WHERE pt.partner_id = $1 ORDER BY pt.created_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT id, user_full_name, details, created_at AS date
         FROM audit_logs
         WHERE resource = 'partners' AND resource_id = $1
           AND details->'modifications'->'pipeline_stage' IS NOT NULL
         ORDER BY created_at DESC`,
        [id]
      ),
    ]);

    const events = [
      ...activitiesRes.rows.map((a) => ({ type: "activity", date: a.date, data: a })),
      ...notesRes.rows.map((n) => ({ type: "note", date: n.date, data: n })),
      ...tasksRes.rows.map((t) => ({ type: "task", date: t.date, data: t })),
      ...stageChangesRes.rows.map((s) => ({
        type: "stage_change",
        date: s.date,
        data: {
          user_full_name: s.user_full_name,
          avant: s.details?.modifications?.pipeline_stage?.avant,
          apres: s.details?.modifications?.pipeline_stage?.apres,
        },
      })),
    ];
    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CHANGER LE STADE DU PIPELINE (drag & drop Kanban) ===== */
router.patch("/:id/pipeline-stage", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { pipeline_stage } = req.body;
    const valid = ["prospect", "actif", "a_relancer", "dormant"];
    if (!valid.includes(pipeline_stage)) {
      return res.status(400).json({ error: "Stade invalide" });
    }

    const before = await pool.query("SELECT name, pipeline_stage FROM partners WHERE id = $1", [id]);
    if (!before.rows.length) return res.status(404).json({ error: "Partenaire introuvable" });

    const result = await pool.query(
      "UPDATE partners SET pipeline_stage = $1 WHERE id = $2 RETURNING *",
      [pipeline_stage, id]
    );
    const updated = result.rows[0];

    if (before.rows[0].pipeline_stage !== pipeline_stage) {
      logAudit(req, "UPDATE", "partners", id, updated.name, {
        modifications: {
          pipeline_stage: { avant: before.rows[0].pipeline_stage, apres: pipeline_stage },
        },
      });
    }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== NOTES INTERNES ===== */
router.get("/:id/notes", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pn.*, u.full_name AS author_name
       FROM partner_notes pn LEFT JOIN users u ON u.id = pn.author_id
       WHERE pn.partner_id = $1 ORDER BY pn.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/:id/notes", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const content = (req.body?.content || "").trim();
    if (!content) return res.status(400).json({ error: "Contenu requis" });
    const result = await pool.query(
      `INSERT INTO partner_notes (partner_id, author_id, content) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, req.user.id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id/notes/:noteId", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM partner_notes WHERE id = $1 AND partner_id = $2", [
      req.params.noteId,
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== TÂCHES DE SUIVI ===== */
router.get("/:id/tasks", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pt.*, u.full_name AS assigned_name
       FROM partner_tasks pt LEFT JOIN users u ON u.id = pt.assigned_to
       WHERE pt.partner_id = $1
       ORDER BY pt.completed ASC, pt.due_date ASC NULLS LAST, pt.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/:id/tasks", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const title = (req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "Titre requis" });
    const { due_date = null, assigned_to = null } = req.body;
    const result = await pool.query(
      `INSERT INTO partner_tasks (partner_id, title, due_date, assigned_to, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, title, due_date || null, assigned_to || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/:id/tasks/:taskId", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const completed = Boolean(req.body?.completed);
    const result = await pool.query(
      `UPDATE partner_tasks
       SET completed = $1, completed_at = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id = $2 AND partner_id = $3 RETURNING *`,
      [completed, req.params.taskId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Tâche introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id/tasks/:taskId", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM partner_tasks WHERE id = $1 AND partner_id = $2", [
      req.params.taskId,
      req.params.id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE PARTNER ===== */
router.post("/", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const {
      name,
      description = null,
      contact_email = null,
      contact_phone = null,
      objective_beneficiaries = 0,
      status = "active",
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nom requis" });
    }

    const result = await pool.query(
      `
      INSERT INTO partners
      (name, description, contact_email, contact_phone, objective_beneficiaries, status)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        name,
        description,
        contact_email,
        contact_phone,
        objective_beneficiaries,
        status,
      ]
    );

    const created = result.rows[0];
    logAudit(req, "CREATE", "partners", created.id, created.name, { status: created.status });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE PARTNER ===== */
router.put("/:id", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description = null,
      contact_email = null,
      contact_phone = null,
      objective_beneficiaries = 0,
      status = "active",
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Nom requis" });
    }

    const result = await pool.query(
      `
      UPDATE partners
      SET name = $1,
          description = $2,
          contact_email = $3,
          contact_phone = $4,
          objective_beneficiaries = $5,
          status = $6
      WHERE id = $7
      RETURNING *
      `,
      [
        name,
        description,
        contact_email,
        contact_phone,
        objective_beneficiaries,
        status,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Partenaire introuvable" });
    }

    const updated = result.rows[0];
    logAudit(req, "UPDATE", "partners", updated.id, updated.name, { status: updated.status });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET PARTNER DEVICES ===== */
router.get("/:id/devices", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT device_id FROM partner_devices WHERE partner_id = $1",
      [req.params.id]
    );
    res.json(result.rows.map((r) => r.device_id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SET PARTNER DEVICES ===== */
router.put("/:id/devices", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { device_ids = [] } = req.body;
    const { id } = req.params;

    await pool.query("DELETE FROM partner_devices WHERE partner_id = $1", [id]);

    if (device_ids.length > 0) {
      const values = device_ids
        .map((_, i) => `($1, $${i + 2})`)
        .join(", ");
      await pool.query(
        `INSERT INTO partner_devices (partner_id, device_id) VALUES ${values}`,
        [id, ...device_ids]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE PARTNER ===== */
router.delete("/:id", authMiddleware, requireAdmin, requireAdminPin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await pool.query("SELECT name FROM partners WHERE id = $1", [id]);
    const result = await pool.query(
      "DELETE FROM partners WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Partenaire introuvable" });
    }

    logAudit(req, "DELETE", "partners", id, before.rows[0]?.name ?? null, {});
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
