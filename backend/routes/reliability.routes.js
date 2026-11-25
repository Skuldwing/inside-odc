const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { logAudit } = require("../services/audit");
const { getReliabilityThreshold, setReliabilityThreshold, computeAndStoreReliability } = require("../services/reliability");
const { validationPrete } = require("../migrations/validationActivites");
const { controlerActivites } = require("../services/controlesActivite");

const router = express.Router();

router.use(authMiddleware, requireAdmin);
/* Les colonnes de validation peuvent manquer juste après un déploiement. */
router.use((req, res, next) => {
  validationPrete().then(() => next(), (err) => {
    console.error("[fiabilité] schéma de validation :", err.message);
    res.status(503).json({ error: "Mise à jour en cours, réessayez dans un instant." });
  });
});

/* ===== FILE DE VÉRIFICATION (?status=a_verifier|validee|rejetee|all, défaut a_verifier) ===== */
router.get("/queue", async (req, res) => {
  try {
    const status = req.query.status || "a_verifier";
    const validStatuses = ["a_verifier", "validee", "rejetee"];
    /* « historique » : les validations automatiques de l'ancien système,
       gardées telles quelles mais qu'on peut vouloir relire. */
    const where =
      status === "all"
        ? ""
        : status === "historique"
          ? "WHERE a.reliability_status = 'validee' AND a.validation_origine = 'historique'"
          : validStatuses.includes(status)
            ? "WHERE a.reliability_status = $1"
            : "WHERE a.reliability_status = 'a_verifier'";
    const params = status !== "all" && validStatuses.includes(status) ? [status] : [];
    const limite = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const decalage = Math.max(Number(req.query.offset) || 0, 0);

    const result = await pool.query(
      `
      SELECT a.id, a.title, a.activity_date, a.mode, a.participants_manual,
             a.reliability_score, a.reliability_status, a.reliability_manual_override,
             a.reliability_details, a.duplicate_of, dup.title AS duplicate_of_title,
             a.validation_origine, a.validation_le, a.validation_effectif, a.validation_motif,
             uv.full_name AS validation_par_nom, ud.full_name AS declare_par_nom, ud.role AS declare_par_role,
             p.name AS partner_name, u.full_name AS coach_name,
             COALESCE(ap.participants_count, 0)::int AS participants_count
      FROM activities a
      LEFT JOIN partners p ON a.partner_id = p.id
      LEFT JOIN users u ON a.coach_id = u.id
      LEFT JOIN users uv ON uv.id = a.validation_par
      LEFT JOIN users ud ON ud.id = a.created_by
      LEFT JOIN activities dup ON dup.id = a.duplicate_of
      LEFT JOIN (
        SELECT activity_id, COUNT(*)::int AS participants_count
        FROM activity_participants GROUP BY activity_id
      ) ap ON ap.activity_id = a.id
      ${where}
      ORDER BY (a.validation_origine IN ('reouverte', 'resoumise')) DESC NULLS LAST, a.activity_date DESC, a.id DESC
      LIMIT ${limite} OFFSET ${decalage}
      `,
      params
    );
    const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM activities a ${where}`, params);
    /* Les contrôles automatiques de chaque activité affichée. */
    const controles = await controlerActivites(result.rows.map((r) => r.id));
    res.json({
      total: totalRes.rows[0].n,
      activites: result.rows.map((r) => ({ ...r, controles: controles.get(Number(r.id)) || { alertes: [], preuve: null } })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CONTRÔLES D'UNE ACTIVITÉ ===== */
router.get("/:id/controles", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Activité invalide" });
    const controles = await controlerActivites([id]);
    res.json(controles.get(id) || { alertes: [], preuve: null });
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

/* ===== DÉCIDER : VALIDER OU REJETER =====
   La décision porte la liste telle qu'elle est à cet instant : son effectif
   est noté, et si elle s'allonge ensuite, l'activité revient « à vérifier ». */
async function decider(req, res, statut) {
  const { id } = req.params;
  const motif = typeof req.body?.motif === "string" ? req.body.motif.trim().slice(0, 1000) : "";
  if (statut === "rejetee" && !motif) {
    return res.status(400).json({ error: "Indiquez au partenaire ce qui ne va pas." });
  }
  const result = await pool.query(
    `UPDATE activities a
        SET reliability_status = $1,
            reliability_manual_override = TRUE,
            validation_origine = 'admin',
            validation_par = $2,
            validation_le = NOW(),
            validation_motif = $3,
            validation_effectif = (SELECT COUNT(*) FROM activity_participants ap
                                    WHERE ap.activity_id = a.id)
      WHERE a.id = $4
      RETURNING a.id, a.title, a.validation_effectif`,
    [statut, req.user.id, statut === "rejetee" ? motif : null, id]
  );
  if (!result.rows.length) return res.status(404).json({ error: "Activité introuvable" });
  logAudit(req, "UPDATE", "activities", id, result.rows[0].title, {
    action: statut === "validee" ? "reliability_validate_manual" : "reliability_reject_manual",
    effectif: result.rows[0].validation_effectif,
    motif: statut === "rejetee" ? motif : undefined,
  });
  res.json({ success: true });
}

router.patch("/:id/validate", async (req, res) => {
  try {
    await decider(req, res, "validee");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/:id/reject", async (req, res) => {
  try {
    await decider(req, res, "rejetee");
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ANNULER LA DÉCISION =====
   L'activité revient à son état de départ : « à vérifier », ou validée
   d'office si c'est un administrateur qui l'a déclarée. */
router.patch("/:id/reset", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE activities
          SET reliability_manual_override = FALSE,
              reliability_status = 'a_verifier',
              validation_origine = NULL, validation_par = NULL, validation_le = NULL,
              validation_effectif = NULL, validation_motif = NULL
        WHERE id = $1 RETURNING id, title`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Activité introuvable" });
    await computeAndStoreReliability(id);

    logAudit(req, "UPDATE", "activities", id, result.rows[0].title, {
      action: "reliability_reset",
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
