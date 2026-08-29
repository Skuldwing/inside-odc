const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { logAudit } = require("../services/audit");
const { getReliabilityThreshold, setReliabilityThreshold } = require("../services/reliability");

const router = express.Router();

router.use(authMiddleware, requireAdmin);

/* ===== FILE DE VÉRIFICATION (?status=a_verifier|validee|rejetee|all, défaut a_verifier) ===== */
router.get("/queue", async (req, res) => {
  try {
    const status = req.query.status || "a_verifier";
    const validStatuses = ["a_verifier", "validee", "rejetee"];
    const where =
      status === "all"
        ? ""
        : validStatuses.includes(status)
          ? "WHERE a.reliability_status = $1"
          : "WHERE a.reliability_status = 'a_verifier'";
    const params = status !== "all" && validStatuses.includes(status) ? [status] : [];

    const result = await pool.query(
      `
      SELECT a.id, a.title, a.activity_date, a.mode, a.participants_manual,
             a.reliability_score, a.reliability_status, a.reliability_manual_override,
             a.reliability_details, a.duplicate_of, dup.title AS duplicate_of_title,
             p.name AS partner_name, u.full_name AS coach_name,
             COALESCE(ap.participants_count, 0)::int AS participants_count
      FROM activities a
      LEFT JOIN partners p ON a.partner_id = p.id
      LEFT JOIN users u ON a.coach_id = u.id
      LEFT JOIN activities dup ON dup.id = a.duplicate_of
      LEFT JOIN (
        SELECT activity_id, COUNT(*)::int AS participants_count
        FROM activity_participants GROUP BY activity_id
      ) ap ON ap.activity_id = a.id
      ${where}
      ORDER BY a.reliability_score ASC NULLS FIRST, a.activity_date DESC
      `,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== VOIR LA LISTE DE PARTICIPANTS D'UNE ACTIVITÉ ===== */
router.get("/:id/participants", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.id, p.prenom, p.nom, p.telephone, p.email, p.genre, p.age_range, p.structure
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       WHERE ap.activity_id = $1
       ORDER BY p.nom, p.prenom`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== VALIDER MANUELLEMENT ===== */
router.patch("/:id/validate", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE activities
       SET reliability_status = 'validee', reliability_manual_override = TRUE
       WHERE id = $1 RETURNING id, title`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    logAudit(req, "UPDATE", "activities", id, result.rows[0].title, {
      action: "reliability_validate_manual",
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== REJETER MANUELLEMENT ===== */
router.patch("/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE activities
       SET reliability_status = 'rejetee', reliability_manual_override = TRUE
       WHERE id = $1 RETURNING id, title`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    logAudit(req, "UPDATE", "activities", id, result.rows[0].title, {
      action: "reliability_reject_manual",
      motif: req.body?.motif || null,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== RENVOYER EN VÉRIFICATION AUTOMATIQUE (annule le forçage manuel) ===== */
router.patch("/:id/reset", async (req, res) => {
  try {
    const { id } = req.params;
    const threshold = await getReliabilityThreshold();
    const result = await pool.query(
      `UPDATE activities
       SET reliability_manual_override = FALSE,
           reliability_status = CASE WHEN reliability_score >= $1 THEN 'validee' ELSE 'a_verifier' END
       WHERE id = $2 RETURNING id, title`,
      [threshold, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    logAudit(req, "UPDATE", "activities", id, result.rows[0].title, {
      action: "reliability_reset_auto",
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SEUIL DE FIABILITÉ ===== */
router.get("/settings", async (req, res) => {
  try {
    const threshold = await getReliabilityThreshold();
    res.json({ threshold });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const threshold = Number(req.body?.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      return res.status(400).json({ error: "Seuil invalide (0-100)" });
    }
    await setReliabilityThreshold(threshold);
    logAudit(req, "UPDATE", "app_settings", "reliability_threshold", "Seuil de fiabilité", { threshold });
    res.json({ threshold });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
