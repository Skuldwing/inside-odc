const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

const PLATFORMS = ["facebook", "instagram", "linkedin", "x", "tiktok"];

function growthPct(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

router.get("/summary", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const prevYear = year - 1;

    const [monthlyRes, yearTotalsRes, prevYearTotalsRes, latestPerPlatformRes] =
      await Promise.all([
        pool.query(
          `
          SELECT
            to_char(month_date, 'YYYY-MM') AS month,
            SUM(followers)::bigint AS followers,
            SUM(reach)::bigint AS reach,
            SUM(engagement)::bigint AS engagement,
            SUM(unique_users)::bigint AS unique_users,
            SUM(results)::bigint AS results
          FROM social_media_kpis
          WHERE EXTRACT(YEAR FROM month_date) = $1
          GROUP BY month
          ORDER BY month
          `,
          [year]
        ),
        pool.query(
          `
          SELECT
            COALESCE(SUM(reach), 0)::bigint AS reach_total,
            COALESCE(SUM(engagement), 0)::bigint AS engagement_total,
            COALESCE(SUM(unique_users), 0)::bigint AS unique_users_total,
            COALESCE(SUM(results), 0)::bigint AS results_total
          FROM social_media_kpis
          WHERE EXTRACT(YEAR FROM month_date) = $1
          `,
          [year]
        ),
        pool.query(
          `
          SELECT
            COALESCE(SUM(reach), 0)::bigint AS reach_total,
            COALESCE(SUM(engagement), 0)::bigint AS engagement_total,
            COALESCE(SUM(unique_users), 0)::bigint AS unique_users_total,
            COALESCE(SUM(results), 0)::bigint AS results_total
          FROM social_media_kpis
          WHERE EXTRACT(YEAR FROM month_date) = $1
          `,
          [prevYear]
        ),
        pool.query(
          `
          SELECT s.platform, s.followers
          FROM social_media_kpis s
          INNER JOIN (
            SELECT platform, MAX(month_date) AS max_month
            FROM social_media_kpis
            WHERE EXTRACT(YEAR FROM month_date) = $1
            GROUP BY platform
          ) m ON m.platform = s.platform AND m.max_month = s.month_date
          `,
          [year]
        ),
      ]);

    const monthly = monthlyRes.rows.map((r) => ({
      month: r.month,
      followers: Number(r.followers || 0),
      reach: Number(r.reach || 0),
      engagement: Number(r.engagement || 0),
      unique_users: Number(r.unique_users || 0),
      results: Number(r.results || 0),
    }));

    const currentTotals = yearTotalsRes.rows[0] || {};
    const prevTotals = prevYearTotalsRes.rows[0] || {};

    const latestByPlatformMap = new Map(
      latestPerPlatformRes.rows.map((r) => [r.platform, Number(r.followers || 0)])
    );
    const latestByPlatform = PLATFORMS.map((platform) => ({
      platform,
      followers: latestByPlatformMap.get(platform) || 0,
    }));

    const totalFollowersLatest = latestByPlatform.reduce(
      (sum, p) => sum + p.followers,
      0
    );
    const previousMonthFollowers =
      monthly.length > 1 ? monthly[monthly.length - 2].followers : 0;
    const platformDistribution = latestByPlatform.map((p) => ({
      name: p.platform,
      value: p.followers,
    }));

    const cards = {
      followers: {
        label: "Portee Followers",
        value: totalFollowersLatest,
        growth_pct: growthPct(totalFollowersLatest, previousMonthFollowers),
      },
      reach: {
        label: "Portee",
        value: Number(currentTotals.reach_total || 0),
        growth_pct: growthPct(
          Number(currentTotals.reach_total || 0),
          Number(prevTotals.reach_total || 0)
        ),
      },
      engagement: {
        label: "Engagement",
        value: Number(currentTotals.engagement_total || 0),
        growth_pct: growthPct(
          Number(currentTotals.engagement_total || 0),
          Number(prevTotals.engagement_total || 0)
        ),
      },
      unique_users: {
        label: "Audience unique",
        value: Number(currentTotals.unique_users_total || 0),
        growth_pct: growthPct(
          Number(currentTotals.unique_users_total || 0),
          Number(prevTotals.unique_users_total || 0)
        ),
      },
      results: {
        label: "Resultats",
        value: Number(currentTotals.results_total || 0),
        growth_pct: growthPct(
          Number(currentTotals.results_total || 0),
          Number(prevTotals.results_total || 0)
        ),
      },
    };

    res.json({
      meta: { year, previous_year: prevYear },
      cards,
      monthly,
      platform_distribution: platformDistribution,
      latest_by_platform: latestByPlatform,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
