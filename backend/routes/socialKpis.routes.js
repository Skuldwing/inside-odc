const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const requireAdminPin = require("../middleware/pin.middleware");

const router = express.Router();

const ALLOWED_PLATFORMS = new Set([
  "facebook",
  "instagram",
  "linkedin",
  "x",
  "tiktok",
]);

function normalizePlatform(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMonthDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7) + "-01";
  return null;
}

function toSafeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

router.use(authMiddleware, requireAdmin);

router.get("/", async (req, res) => {
  try {
    const year = Number(req.query.year);
    const params = [];
    let where = "";

    if (Number.isFinite(year) && year > 1900) {
      where = "WHERE EXTRACT(YEAR FROM month_date) = $1";
      params.push(year);
    }

    const result = await pool.query(
      `
      SELECT id, platform, month_date, followers, reach, engagement, unique_users, results, created_at, updated_at
      FROM social_media_kpis
      ${where}
      ORDER BY month_date DESC, platform ASC
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/", requireAdminPin, async (req, res) => {
  try {
    const platform = normalizePlatform(req.body.platform);
    const monthDate = normalizeMonthDate(req.body.month_date);

    if (!ALLOWED_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: "Plateforme invalide" });
    }

    if (!monthDate) {
      return res.status(400).json({ error: "Mois invalide (YYYY-MM)" });
    }

    const result = await pool.query(
      `
      INSERT INTO social_media_kpis
      (platform, month_date, followers, reach, engagement, unique_users, results, created_by, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (platform, month_date)
      DO UPDATE SET
        followers = EXCLUDED.followers,
        reach = EXCLUDED.reach,
        engagement = EXCLUDED.engagement,
        unique_users = EXCLUDED.unique_users,
        results = EXCLUDED.results,
        created_by = EXCLUDED.created_by,
        updated_at = NOW()
      RETURNING *
      `,
      [
        platform,
        monthDate,
        toSafeNumber(req.body.followers),
        toSafeNumber(req.body.reach),
        toSafeNumber(req.body.engagement),
        toSafeNumber(req.body.unique_users),
        toSafeNumber(req.body.results),
        req.user.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/:id", requireAdminPin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const platform = normalizePlatform(req.body.platform);
    const monthDate = normalizeMonthDate(req.body.month_date);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID invalide" });
    }
    if (!ALLOWED_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: "Plateforme invalide" });
    }
    if (!monthDate) {
      return res.status(400).json({ error: "Mois invalide (YYYY-MM)" });
    }

    const result = await pool.query(
      `
      UPDATE social_media_kpis
      SET
        platform = $1,
        month_date = $2,
        followers = $3,
        reach = $4,
        engagement = $5,
        unique_users = $6,
        results = $7,
        created_by = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        platform,
        monthDate,
        toSafeNumber(req.body.followers),
        toSafeNumber(req.body.reach),
        toSafeNumber(req.body.engagement),
        toSafeNumber(req.body.unique_users),
        toSafeNumber(req.body.results),
        req.user.id,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "KPI introuvable" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    if (err?.code === "23505") {
      return res
        .status(409)
        .json({ error: "Un KPI existe deja pour cette plateforme et ce mois" });
    }
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id", requireAdminPin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID invalide" });
    }

    const result = await pool.query(
      "DELETE FROM social_media_kpis WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "KPI introuvable" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
