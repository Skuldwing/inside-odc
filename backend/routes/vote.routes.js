const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

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
router.get("/sessions", authMiddleware, requireAdmin, async (req, res) => {
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
router.post("/sessions", authMiddleware, requireAdmin, async (req, res) => {
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
router.get("/sessions/:id", authMiddleware, requireAdmin, async (req, res) => {
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
router.put("/sessions/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { name, event_date, pitch_duration_minutes, qa_duration_minutes } = req.body;
    const r = await pool.query(
      "UPDATE vote_sessions SET name=$1, event_date=$2, pitch_duration_minutes=$3, qa_duration_minutes=$4 WHERE id=$5 RETURNING *",
      [name, event_date || null, pitch_duration_minutes || 5, qa_duration_minutes || 5, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Session introuvable" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* DELETE /vote/sessions/:id */
router.delete("/sessions/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM vote_sessions WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* PUT /vote/sessions/:id/activate */
router.put("/sessions/:id/activate", authMiddleware, requireAdmin, async (req, res) => {
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
router.put("/sessions/:id/close", authMiddleware, requireAdmin, async (req, res) => {
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
router.put("/sessions/:id/active-project", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { project_id } = req.body;
    await pool.query(
      "UPDATE vote_projects SET status='pending', started_at=NULL, qa_started_at=NULL WHERE session_id=$1 AND status='active'",
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
router.post("/sessions/:id/close-project", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const sessRes = await pool.query("SELECT active_project_id FROM vote_sessions WHERE id=$1", [id]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    const { active_project_id } = sessRes.rows[0];
    if (active_project_id) {
      await pool.query("UPDATE vote_projects SET status='closed', qa_started_at=NULL WHERE id=$1", [active_project_id]);
    }
    await pool.query("UPDATE vote_sessions SET active_project_id=NULL WHERE id=$1", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/sessions/:id/live */
router.get("/sessions/:id/live", authMiddleware, requireAdmin, async (req, res) => {
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

    res.json({ session, projects: projRes.rows, active_project, jury, criteria, voted_count, jury_total: juryRes.rows.length, pitch_duration_minutes: session.pitch_duration_minutes ?? 5, qa_duration_minutes: session.qa_duration_minutes ?? 5 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* POST /vote/sessions/:id/start-qa — démarre le timer Q&R sur le projet actif */
router.post("/sessions/:id/start-qa", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const sessRes = await pool.query("SELECT active_project_id FROM vote_sessions WHERE id=$1", [req.params.id]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    const { active_project_id } = sessRes.rows[0];
    if (!active_project_id) return res.status(400).json({ error: "Aucun projet actif" });
    await pool.query("UPDATE vote_projects SET qa_started_at = NOW() WHERE id=$1", [active_project_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/sessions/:id/results — classement complet avec détail par critère et par juré */
router.get("/sessions/:id/results", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [critRes, projRes] = await Promise.all([
      pool.query("SELECT * FROM vote_criteria WHERE session_id=$1 ORDER BY order_num", [id]),
      pool.query("SELECT * FROM vote_projects WHERE session_id=$1 ORDER BY order_num, created_at", [id]),
    ]);

    const [wAvgRes, critAvgRes, juryScoresRes] = await Promise.all([
      pool.query(`
        SELECT vs.project_id,
               SUM(vs.score * vc.weight) / NULLIF(SUM(vc.weight), 0) AS weighted_avg,
               COUNT(DISTINCT vs.jury_id)::int AS voter_count
        FROM vote_scores vs
        JOIN vote_criteria vc ON vc.id = vs.criteria_id
        WHERE vs.session_id = $1
        GROUP BY vs.project_id
      `, [id]),
      pool.query(`
        SELECT vs.project_id, vs.criteria_id,
               AVG(vs.score)::numeric(4,2) AS avg_score
        FROM vote_scores vs
        WHERE vs.session_id = $1
        GROUP BY vs.project_id, vs.criteria_id
      `, [id]),
      pool.query(`
        SELECT vs.project_id, vj.id AS jury_id, vj.pseudo, vj.avatar,
               json_agg(
                 json_build_object('criteria_id', vs.criteria_id, 'score', vs.score, 'comment', vs.comment)
                 ORDER BY vc.order_num
               ) AS scores
        FROM vote_scores vs
        JOIN vote_jury vj ON vj.id = vs.jury_id
        JOIN vote_criteria vc ON vc.id = vs.criteria_id
        WHERE vs.session_id = $1
        GROUP BY vs.project_id, vj.id, vj.pseudo, vj.avatar
        ORDER BY vj.pseudo
      `, [id]),
    ]);

    const wAvgMap = {};
    wAvgRes.rows.forEach(r => {
      wAvgMap[r.project_id] = { weighted_avg: parseFloat(r.weighted_avg || 0).toFixed(2), voter_count: r.voter_count };
    });

    const critAvgMap = {};
    critAvgRes.rows.forEach(r => {
      if (!critAvgMap[r.project_id]) critAvgMap[r.project_id] = {};
      critAvgMap[r.project_id][r.criteria_id] = parseFloat(r.avg_score);
    });

    const juryMap = {};
    juryScoresRes.rows.forEach(r => {
      if (!juryMap[r.project_id]) juryMap[r.project_id] = [];
      juryMap[r.project_id].push({ jury_id: r.jury_id, pseudo: r.pseudo, avatar: r.avatar, scores: r.scores });
    });

    const ranking = projRes.rows
      .map(p => ({
        ...p,
        ...(wAvgMap[p.id] || { weighted_avg: "0.00", voter_count: 0 }),
        criteria_scores: critRes.rows.map(c => ({
          criteria_id: c.id,
          name: c.name,
          scale: c.scale,
          avg_score: critAvgMap[p.id]?.[c.id] ?? null,
        })),
        jury_scores: juryMap[p.id] || [],
      }))
      .sort((a, b) => parseFloat(b.weighted_avg) - parseFloat(a.weighted_avg));

    res.json({ criteria: critRes.rows, ranking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/sessions/:id/results/pdf — export PDF du classement */
router.get("/sessions/:id/results/pdf", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const PDFDocument = require("pdfkit");

    const sessRes = await pool.query("SELECT * FROM vote_sessions WHERE id=$1", [id]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    const session = sessRes.rows[0];

    const [critRes, projRes] = await Promise.all([
      pool.query("SELECT * FROM vote_criteria WHERE session_id=$1 ORDER BY order_num", [id]),
      pool.query("SELECT * FROM vote_projects WHERE session_id=$1 ORDER BY order_num", [id]),
    ]);
    const [wAvgRes, critAvgRes] = await Promise.all([
      pool.query(`
        SELECT vs.project_id,
               SUM(vs.score * vc.weight) / NULLIF(SUM(vc.weight), 0) AS weighted_avg,
               COUNT(DISTINCT vs.jury_id)::int AS voter_count
        FROM vote_scores vs
        JOIN vote_criteria vc ON vc.id = vs.criteria_id
        WHERE vs.session_id = $1
        GROUP BY vs.project_id
      `, [id]),
      pool.query(`
        SELECT vs.project_id, vs.criteria_id, AVG(vs.score)::numeric(4,2) AS avg_score
        FROM vote_scores vs WHERE vs.session_id = $1
        GROUP BY vs.project_id, vs.criteria_id
      `, [id]),
    ]);

    const wAvgMap = {};
    wAvgRes.rows.forEach(r => { wAvgMap[r.project_id] = { weighted_avg: parseFloat(r.weighted_avg || 0).toFixed(2), voter_count: r.voter_count }; });
    const critAvgMap = {};
    critAvgRes.rows.forEach(r => { if (!critAvgMap[r.project_id]) critAvgMap[r.project_id] = {}; critAvgMap[r.project_id][r.criteria_id] = parseFloat(r.avg_score); });

    const ranking = projRes.rows
      .map(p => ({ ...p, ...(wAvgMap[p.id] || { weighted_avg: "0.00", voter_count: 0 }) }))
      .sort((a, b) => parseFloat(b.weighted_avg) - parseFloat(a.weighted_avg));

    const doc = new PDFDocument({ margin: 45, size: "A4" });
    const filename = `resultats-${session.name.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    /* Header */
    doc.rect(0, 0, doc.page.width, 70).fill("#FF7900");
    doc.fillColor("#fff").fontSize(18).font("Helvetica-Bold")
       .text("Resultats de vote", 45, 22);
    doc.fontSize(11).font("Helvetica")
       .text(session.name, 45, 46);
    doc.moveDown(3).fillColor("#0F172A");

    /* Classement */
    doc.fontSize(13).font("Helvetica-Bold").text("Classement general", { underline: false });
    doc.moveDown(0.4);
    const medals = ["1er", "2eme", "3eme"];
    ranking.forEach((p, i) => {
      const medal = medals[i] || `#${i + 1}`;
      doc.fontSize(11).font("Helvetica-Bold")
         .text(`${medal}  ${p.name}`, { continued: true })
         .font("Helvetica").fillColor("#FF7900")
         .text(`  ${p.weighted_avg} / ${critRes.rows[0]?.scale || 10}  `, { continued: true })
         .fillColor("#64748B")
         .text(`(${p.voter_count} vote${p.voter_count !== 1 ? "s" : ""})`);
      if (p.porteur) doc.fontSize(9).fillColor("#64748B").text(`   Equipe : ${p.porteur}`);
      doc.fillColor("#0F172A").moveDown(0.3);
    });

    /* Detail par critere */
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 70).fill("#FF7900");
    doc.fillColor("#fff").fontSize(18).font("Helvetica-Bold").text("Detail par critere", 45, 22);
    doc.fontSize(11).font("Helvetica").text(session.name, 45, 46);
    doc.moveDown(3).fillColor("#0F172A");

    ranking.forEach((p, i) => {
      const medal = medals[i] || `#${i + 1}`;
      doc.fontSize(12).font("Helvetica-Bold").text(`${medal}  ${p.name}`);
      critRes.rows.forEach(c => {
        const avg = critAvgMap[p.id]?.[c.id];
        const bar = avg != null ? `${avg.toFixed(2)} / ${c.scale}` : "—";
        doc.fontSize(10).font("Helvetica")
           .text(`  • ${c.name} : `, { continued: true })
           .fillColor("#FF7900").text(bar)
           .fillColor("#0F172A");
      });
      doc.moveDown(0.5);
    });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Erreur génération PDF" });
  }
});

/* GET /vote/sessions/:id/jury-results — classement public pour le jury (après clôture) */
router.get("/sessions/:id/jury-results", juryAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.jury.session_id !== id) return res.status(403).json({ error: "Acces non autorise" });
    const sessRes = await pool.query("SELECT status, name FROM vote_sessions WHERE id=$1", [id]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    if (sessRes.rows[0].status !== "closed") return res.status(403).json({ error: "Resultats non disponibles" });

    const [projRes, wAvgRes] = await Promise.all([
      pool.query("SELECT id, name, porteur FROM vote_projects WHERE session_id=$1 ORDER BY order_num", [id]),
      pool.query(`
        SELECT vs.project_id,
               SUM(vs.score * vc.weight) / NULLIF(SUM(vc.weight), 0) AS weighted_avg,
               COUNT(DISTINCT vs.jury_id)::int AS voter_count
        FROM vote_scores vs
        JOIN vote_criteria vc ON vc.id = vs.criteria_id
        WHERE vs.session_id = $1
        GROUP BY vs.project_id
      `, [id]),
    ]);

    const wAvgMap = {};
    wAvgRes.rows.forEach(r => { wAvgMap[r.project_id] = { weighted_avg: parseFloat(r.weighted_avg || 0).toFixed(2), voter_count: r.voter_count }; });

    const ranking = projRes.rows
      .map(p => ({ ...p, ...(wAvgMap[p.id] || { weighted_avg: "0.00", voter_count: 0 }) }))
      .sort((a, b) => parseFloat(b.weighted_avg) - parseFloat(a.weighted_avg));

    res.json({ session_name: sessRes.rows[0].name, ranking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ------- PROJECTS ------- */
router.post("/sessions/:id/projects", authMiddleware, requireAdmin, async (req, res) => {
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

router.put("/sessions/:id/projects/:pid", authMiddleware, requireAdmin, async (req, res) => {
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

router.delete("/sessions/:id/projects/:pid", authMiddleware, requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM vote_projects WHERE id=$1 AND session_id=$2", [req.params.pid, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ------- CRITERIA ------- */
router.post("/sessions/:id/criteria", authMiddleware, requireAdmin, async (req, res) => {
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

router.put("/sessions/:id/criteria/:cid", authMiddleware, requireAdmin, async (req, res) => {
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

router.delete("/sessions/:id/criteria/:cid", authMiddleware, requireAdmin, async (req, res) => {
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
    const { pseudo, avatar, email } = req.body;
    if (!pseudo?.trim()) return res.status(400).json({ error: "Pseudo requis" });
    const sessRes = await pool.query("SELECT id, status FROM vote_sessions WHERE id=$1", [req.params.sessionId]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    if (sessRes.rows[0].status === "draft") return res.status(403).json({ error: "Session pas encore ouverte" });
    if (sessRes.rows[0].status === "closed") return res.status(403).json({ error: "Session terminee" });

    const normalizedEmail = email?.trim().toLowerCase() || null;
    /* Avatar : URL DiceBear ou emoji de secours */
    const avatarVal = (avatar && avatar.length > 0) ? avatar : "🧑";

    /* Stratégie SELECT-then-INSERT/UPDATE — compatible même sans contrainte unique */
    const existing = await pool.query(
      "SELECT * FROM vote_jury WHERE session_id=$1 AND pseudo=$2",
      [req.params.sessionId, pseudo.trim()]
    );

    let row;
    if (existing.rows.length) {
      /* Juré déjà inscrit : met à jour avatar et email */
      const upd = await pool.query(
        "UPDATE vote_jury SET avatar=$1, email=COALESCE($2, email) WHERE id=$3 RETURNING *",
        [avatarVal, normalizedEmail, existing.rows[0].id]
      );
      row = upd.rows[0];
    } else {
      /* Nouveau juré : INSERT avec fallback emoji si colonne pas encore TEXT */
      try {
        const ins = await pool.query(
          "INSERT INTO vote_jury (session_id, pseudo, avatar, email) VALUES ($1,$2,$3,$4) RETURNING *",
          [req.params.sessionId, pseudo.trim(), avatarVal, normalizedEmail]
        );
        row = ins.rows[0];
      } catch (insErr) {
        if (insErr.code === "22001") {
          /* Avatar trop long pour VARCHAR(20) — migration pas encore appliquée */
          const ins2 = await pool.query(
            "INSERT INTO vote_jury (session_id, pseudo, avatar, email) VALUES ($1,$2,$3,$4) RETURNING *",
            [req.params.sessionId, pseudo.trim(), "🧑", normalizedEmail]
          );
          row = ins2.rows[0];
        } else {
          throw insErr;
        }
      }
    }

    res.json({ token: row.token, jury_id: row.id, pseudo: row.pseudo, avatar: row.avatar });
  } catch (err) {
    console.error("JOIN ERROR:", err.message, err.code);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* POST /vote/recover/:sessionId — retrouver sa session par email */
router.post("/recover/:sessionId", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email?.trim()) return res.status(400).json({ error: "Email requis" });
    const sessRes = await pool.query("SELECT id, status FROM vote_sessions WHERE id=$1", [req.params.sessionId]);
    if (!sessRes.rows.length) return res.status(404).json({ error: "Session introuvable" });
    if (sessRes.rows[0].status === "draft") return res.status(403).json({ error: "Session pas encore ouverte" });
    const r = await pool.query(
      "SELECT * FROM vote_jury WHERE session_id=$1 AND email=$2",
      [req.params.sessionId, email.trim().toLowerCase()]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Aucune session trouvée pour cet email." });
    const row = r.rows[0];
    res.json({ token: row.token, jury_id: row.id, pseudo: row.pseudo, avatar: row.avatar });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* GET /vote/jury/status — état courant (polling) */
router.get("/jury/status", juryAuth, async (req, res) => {
  try {
    const sessionId = req.jury.session_id;

    const [sessRes, critRes, projectsRes, juryRes] = await Promise.all([
      pool.query("SELECT * FROM vote_sessions WHERE id=$1", [sessionId]),
      pool.query("SELECT * FROM vote_criteria WHERE session_id=$1 ORDER BY order_num", [sessionId]),
      pool.query("SELECT id FROM vote_projects WHERE session_id=$1 ORDER BY order_num, created_at", [sessionId]),
      pool.query("SELECT id, pseudo, avatar FROM vote_jury WHERE session_id=$1 ORDER BY joined_at", [sessionId]),
    ]);

    const session = sessRes.rows[0];
    const projects = projectsRes.rows;
    const juryMembers = juryRes.rows;

    let active_project = null;
    let my_scores = {};
    let voted_count = 0;
    let project_index = null;
    let jury_list = juryMembers.map(j => ({ id: j.id, pseudo: j.pseudo, avatar: j.avatar, voted: false }));

    if (session.active_project_id) {
      const idx = projects.findIndex(p => p.id === session.active_project_id);
      project_index = idx >= 0 ? idx + 1 : null;

      const [projRes, scoresRes, votedRes] = await Promise.all([
        pool.query("SELECT * FROM vote_projects WHERE id=$1", [session.active_project_id]),
        pool.query(
          "SELECT criteria_id, score, comment FROM vote_scores WHERE project_id=$1 AND jury_id=$2",
          [session.active_project_id, req.jury.id]
        ),
        pool.query("SELECT DISTINCT jury_id FROM vote_scores WHERE project_id=$1", [session.active_project_id]),
      ]);

      active_project = projRes.rows[0] || null;
      scoresRes.rows.forEach(r => {
        my_scores[r.criteria_id] = { score: parseFloat(r.score), comment: r.comment };
      });

      const votedIds = new Set(votedRes.rows.map(r => r.jury_id));
      voted_count = votedIds.size;
      jury_list = juryMembers.map(j => ({ id: j.id, pseudo: j.pseudo, avatar: j.avatar, voted: votedIds.has(j.id) }));
    }

    res.json({
      session_status: session.status,
      pitch_duration_minutes: session.pitch_duration_minutes ?? 5,
      qa_duration_minutes: session.qa_duration_minutes ?? 5,
      active_project,
      criteria: critRes.rows,
      my_scores,
      jury: { pseudo: req.jury.pseudo, avatar: req.jury.avatar },
      voted_count,
      jury_total: juryMembers.length,
      project_index,
      project_count: projects.length,
      jury_list,
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
