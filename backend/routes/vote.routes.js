const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

/* ── Jury token middleware ── */
async function juryAuth(req, res, next) {
  const token = req.headers["x-jury-token"];
  if (!token) return res.status(401).json({ error: "Token jury requis" });
  try {
    const r = await pool.query("SELECT * FROM vote_jury WHERE token = $1", [token]);
    if (!r.rows.length) return res.status(401).json({ error: "Token invalide" });
    req.jury = r.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

/* ============================================================
   ADMIN ROUTES (authMiddleware)
   ============================================================ */

/* GET /vote/sessions */
router.get("/sessions", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT vs.*,
             COUNT(DISTINCT vp.id)::int AS projects_count,
             COUNT(DISTINCT vj.id)::int AS jury_count
      FROM vote_sessions vs
      LEFT JOIN vote_projects vp ON vp.session_id = vs.id
      LEFT JOIN vote_jury vj ON vj.session_id = vs.id
      GROUP BY vs.id
      ORDER BY vs.created_at DESC
    `);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* POST /vote/sessions */
router.post("/sessions", authMiddleware, async (req, res) => {
  try {
    const { name, event_date, pitch_duration_minutes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nom requis" });
    const r = await pool.query(
      "INSERT INTO vote_sessions (name, event_date, pitch_duration_minutes, created_by) VALUES ($1,$2,$3,$4) RETURNING *",
      [name.trim(), event_date || null, pitch_duration_minutes || 5, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/sessions/:id */
router.get("/sessions/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [sessRes, projRes, critRes, juryRes] = await Promise.all([
      pool.query("SELECT * FROM vote_sessions WHERE id = $1", [id]),
      pool.query("SELECT * FROM vote_projects WHERE session_id = $1 ORDER BY order_num, created_at", [id]),
      pool.query("SELECT * FROM vote_criteria WHERE session_id = $1 ORDER BY order_num, created_at", [id]),
      pool.query("SELECT id, pseudo, avatar, joined_at FROM vote_jury WHERE session_id = $1 ORDER BY joined_at", [id]),
    ]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    res.json({ ...sessRes.rows[0], projects: projRes.rows, criteria: critRes.rows, jury: juryRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* PUT /vote/sessions/:id */
router.put("/sessions/:id", authMiddleware, async (req, res) => {
  try {
    const { name, event_date, pitch_duration_minutes } = req.body;
    const r = await pool.query(
      "UPDATE vote_sessions SET name=$1, event_date=$2, pitch_duration_minutes=$3 WHERE id=$4 RETURNING *",
      [name, event_date || null, pitch_duration_minutes || 5, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Session introuvable" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* DELETE /vote/sessions/:id */
router.delete("/sessions/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM vote_sessions WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* PUT /vote/sessions/:id/activate */
router.put("/sessions/:id/activate", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE vote_sessions SET status='active' WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Session introuvable" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* PUT /vote/sessions/:id/close */
router.put("/sessions/:id/close", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE vote_sessions SET status='closed', active_project_id=NULL WHERE id=$1 RETURNING *",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Session introuvable" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* PUT /vote/sessions/:id/active-project */
router.put("/sessions/:id/active-project", authMiddleware, async (req, res) => {
  try {
    const { project_id } = req.body;
    await pool.query(
      "UPDATE vote_projects SET status='pending', started_at=NULL WHERE session_id=$1 AND status='active'",
      [req.params.id]
    );
    if (project_id) {
      await pool.query(
        "UPDATE vote_projects SET status='active', started_at=NOW() WHERE id=$1",
        [project_id]
      );
    }
    const r = await pool.query(
      "UPDATE vote_sessions SET active_project_id=$1 WHERE id=$2 RETURNING *",
      [project_id || null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* POST /vote/sessions/:id/close-project */
router.post("/sessions/:id/close-project", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const sessRes = await pool.query("SELECT active_project_id FROM vote_sessions WHERE id=$1", [id]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    const { active_project_id } = sessRes.rows[0];
    if (active_project_id) {
      await pool.query("UPDATE vote_projects SET status='closed' WHERE id=$1", [active_project_id]);
    }
    await pool.query("UPDATE vote_sessions SET active_project_id=NULL WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/sessions/:id/live */
router.get("/sessions/:id/live", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const sessRes = await pool.query("SELECT * FROM vote_sessions WHERE id=$1", [id]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    const session = sessRes.rows[0];

    const [juryRes, critRes, projRes] = await Promise.all([
      pool.query("SELECT id, pseudo, avatar FROM vote_jury WHERE session_id=$1 ORDER BY joined_at", [id]),
      pool.query("SELECT * FROM vote_criteria WHERE session_id=$1 ORDER BY order_num", [id]),
      pool.query("SELECT * FROM vote_projects WHERE session_id=$1 ORDER BY order_num, created_at", [id]),
    ]);

    let active_project = null;
    let criteria = critRes.rows;
    let jury = juryRes.rows.map(j => ({ ...j, voted: false }));
    let voted_count = 0;

    if (session.active_project_id) {
      const projRow = projRes.rows.find(p => p.id === session.active_project_id);
      active_project = projRow || null;

      const [votedRes, avgRes] = await Promise.all([
        pool.query("SELECT DISTINCT jury_id FROM vote_scores WHERE project_id=$1", [session.active_project_id]),
        pool.query(`
          SELECT vc.id, AVG(vs.score)::numeric(4,2) AS avg_score, COUNT(vs.id)::int AS vote_count
          FROM vote_criteria vc
          LEFT JOIN vote_scores vs ON vs.criteria_id = vc.id AND vs.project_id = $1
          WHERE vc.session_id = $2
          GROUP BY vc.id
        `, [session.active_project_id, id]),
      ]);

      const votedIds = new Set(votedRes.rows.map(r => r.jury_id));
      jury = juryRes.rows.map(j => ({ ...j, voted: votedIds.has(j.id) }));
      voted_count = votedIds.size;

      const avgMap = {};
      avgRes.rows.forEach(r => { avgMap[r.id] = { avg_score: r.avg_score, vote_count: r.vote_count }; });
      criteria = critRes.rows.map(c => ({ ...c, ...avgMap[c.id] }));
    }

    res.json({ session, projects: projRes.rows, active_project, jury, criteria, voted_count, jury_total: juryRes.rows.length, pitch_duration_minutes: session.pitch_duration_minutes ?? 5 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/sessions/:id/results */
router.get("/sessions/:id/results", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [critRes, projRes] = await Promise.all([
      pool.query("SELECT * FROM vote_criteria WHERE session_id=$1 ORDER BY order_num", [id]),
      pool.query("SELECT * FROM vote_projects WHERE session_id=$1 ORDER BY order_num, created_at", [id]),
    ]);
    const scoresRes = await pool.query(`
      SELECT vs.project_id,
             SUM(vs.score * vc.weight) / NULLIF(SUM(vc.weight), 0) AS weighted_avg,
             COUNT(DISTINCT vs.jury_id)::int AS voter_count
      FROM vote_scores vs
      JOIN vote_criteria vc ON vc.id = vs.criteria_id
      WHERE vs.session_id = $1
      GROUP BY vs.project_id
    `, [id]);

    const avgMap = {};
    scoresRes.rows.forEach(r => {
      avgMap[r.project_id] = { weighted_avg: parseFloat(r.weighted_avg || 0).toFixed(2), voter_count: r.voter_count };
    });
    const ranking = projRes.rows
      .map(p => ({ ...p, ...(avgMap[p.id] || { weighted_avg: "0.00", voter_count: 0 }) }))
      .sort((a, b) => parseFloat(b.weighted_avg) - parseFloat(a.weighted_avg));

    res.json({ criteria: critRes.rows, ranking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ------- PROJECTS ------- */
router.post("/sessions/:id/projects", authMiddleware, async (req, res) => {
  try {
    const { name, porteur, description, order_num } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nom requis" });
    const r = await pool.query(
      "INSERT INTO vote_projects (session_id, name, porteur, description, order_num) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [req.params.id, name.trim(), porteur || null, description || null, order_num || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/sessions/:id/projects/:pid", authMiddleware, async (req, res) => {
  try {
    const { name, porteur, description, order_num } = req.body;
    const r = await pool.query(
      "UPDATE vote_projects SET name=$1, porteur=$2, description=$3, order_num=$4 WHERE id=$5 AND session_id=$6 RETURNING *",
      [name, porteur || null, description || null, order_num || 0, req.params.pid, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Projet introuvable" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/sessions/:id/projects/:pid", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM vote_projects WHERE id=$1 AND session_id=$2", [req.params.pid, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ------- CRITERIA ------- */
router.post("/sessions/:id/criteria", authMiddleware, async (req, res) => {
  try {
    const { name, scale, weight, order_num } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Nom requis" });
    const r = await pool.query(
      "INSERT INTO vote_criteria (session_id, name, scale, weight, order_num) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [req.params.id, name.trim(), scale || 10, weight || 1, order_num || 0]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/sessions/:id/criteria/:cid", authMiddleware, async (req, res) => {
  try {
    const { name, scale, weight, order_num } = req.body;
    const r = await pool.query(
      "UPDATE vote_criteria SET name=$1, scale=$2, weight=$3, order_num=$4 WHERE id=$5 AND session_id=$6 RETURNING *",
      [name, scale || 10, weight || 1, order_num || 0, req.params.cid, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Critere introuvable" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/sessions/:id/criteria/:cid", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM vote_criteria WHERE id=$1 AND session_id=$2", [req.params.cid, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ============================================================
   PUBLIC JURY ROUTES
   ============================================================ */

/* GET /vote/join/:sessionId — info publique */
router.get("/join/:sessionId", async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, name, event_date, status FROM vote_sessions WHERE id=$1",
      [req.params.sessionId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Session introuvable" });
    if (r.rows[0].status === "draft") return res.status(403).json({ error: "Session pas encore ouverte" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* POST /vote/join/:sessionId — rejoindre comme juré */
router.post("/join/:sessionId", async (req, res) => {
  try {
    const { pseudo, avatar } = req.body;
    if (!pseudo?.trim()) return res.status(400).json({ error: "Pseudo requis" });
    const sessRes = await pool.query("SELECT id, status FROM vote_sessions WHERE id=$1", [req.params.sessionId]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    if (sessRes.rows[0].status === "draft") return res.status(403).json({ error: "Session pas encore ouverte" });
    if (sessRes.rows[0].status === "closed") return res.status(403).json({ error: "Session terminee" });
    const r = await pool.query(
      "INSERT INTO vote_jury (session_id, pseudo, avatar) VALUES ($1,$2,$3) RETURNING *",
      [req.params.sessionId, pseudo.trim(), avatar || "🧑"]
    );
    res.json({ token: r.rows[0].token, jury_id: r.rows[0].id, pseudo: r.rows[0].pseudo, avatar: r.rows[0].avatar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/jury/status — état courant (polling) */
router.get("/jury/status", juryAuth, async (req, res) => {
  try {
    const sessionId = req.jury.session_id;
    const sessRes = await pool.query("SELECT * FROM vote_sessions WHERE id=$1", [sessionId]);
    const session = sessRes.rows[0];
    const critRes = await pool.query(
      "SELECT * FROM vote_criteria WHERE session_id=$1 ORDER BY order_num",
      [sessionId]
    );

    let active_project = null;
    let my_scores = {};

    if (session.active_project_id) {
      const [projRes, scoresRes] = await Promise.all([
        pool.query("SELECT * FROM vote_projects WHERE id=$1", [session.active_project_id]),
        pool.query(
          "SELECT criteria_id, score, comment FROM vote_scores WHERE project_id=$1 AND jury_id=$2",
          [session.active_project_id, req.jury.id]
        ),
      ]);
      active_project = projRes.rows[0] || null;
      scoresRes.rows.forEach(r => {
        my_scores[r.criteria_id] = { score: parseFloat(r.score), comment: r.comment };
      });
    }

    res.json({
      session_status: session.status,
      pitch_duration_minutes: session.pitch_duration_minutes ?? 5,
      active_project,
      criteria: critRes.rows,
      my_scores,
      jury: { pseudo: req.jury.pseudo, avatar: req.jury.avatar },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* POST /vote/jury/scores — soumettre notes */
router.post("/jury/scores", juryAuth, async (req, res) => {
  try {
    const { project_id, scores } = req.body;
    if (!project_id || !Array.isArray(scores) || scores.length === 0) {
      return res.status(400).json({ error: "project_id et scores requis" });
    }
    const projRes = await pool.query("SELECT status FROM vote_projects WHERE id=$1", [project_id]);
    if (!projRes.rows.length) return res.status(404).json({ error: "Projet introuvable" });
    if (projRes.rows[0].status === "closed") return res.status(403).json({ error: "Votes clotures pour ce projet" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const s of scores) {
        await client.query(`
          INSERT INTO vote_scores (session_id, project_id, jury_id, criteria_id, score, comment)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (project_id, jury_id, criteria_id)
          DO UPDATE SET score=$5, comment=$6, submitted_at=NOW()
        `, [req.jury.session_id, project_id, req.jury.id, s.criteria_id, s.score, s.comment || null]);
      }
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
