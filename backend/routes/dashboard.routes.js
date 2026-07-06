const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

function buildFilters(req) {
  const year = Number(req.query.year) || new Date().getFullYear();
  const month = req.query.month ? Number(req.query.month) : null;
  
  let from, to;
  if (month) {
    const lastDay = new Date(year, month, 0).getDate();
    from = req.query.from || `${year}-${String(month).padStart(2, '0')}-01`;
    to = req.query.to || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    from = req.query.from || `${year}-01-01`;
    to = req.query.to || `${year}-12-31`;
  }

  let partnerId = req.query.partner_id || null;
  if (req.user.role === "partner") {
    partnerId = req.user.partner_id;
  }

  const deviceId = req.query.device_id || null;
  const gender = req.query.gender || null;

  const params = [from, to];
  let idx = 3;
  let where = "a.activity_date BETWEEN $1 AND $2";

  if (partnerId) {
    where += ` AND a.partner_id = $${idx++}`;
    params.push(partnerId);
  }
  if (deviceId) {
    where += ` AND a.device_id = $${idx++}`;
    params.push(deviceId);
  }
  if (gender) {
    where += ` AND part.genre = $${idx++}`;
    params.push(gender);
  }

  return { where, params, year, from, to, partnerId };
}

router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const { where, params, year, from, to, partnerId } = buildFilters(req);

    const [durationColCheck, participantsManualColCheck] = await Promise.all([
      pool.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activities' AND column_name = 'duration_hours' LIMIT 1
      `),
      pool.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activities' AND column_name = 'participants_manual' LIMIT 1
      `),
    ]);

    const durationExpr =
      durationColCheck.rowCount > 0 ? "a.duration_hours" : "NULL::int";
    const participantsManualExpr =
      participantsManualColCheck.rowCount > 0 ? "a.participants_manual" : "NULL::int";

    const baseCte = `
      WITH base AS (
        SELECT a.id AS activity_id,
               a.title,
               a.activity_date,
               ${durationExpr} AS duration_hours,
               ${participantsManualExpr} AS participants_manual,
               a.location,
               a.device_id,
               COALESCE(d.name, 'Non renseigne') AS device_name,
               d.color AS device_color,
               a.partner_id,
               COALESCE(p.name, 'Non renseigne') AS partner_name,
               ap.participant_id,
               part.genre
        FROM activities a
        LEFT JOIN devices d ON a.device_id = d.id
        LEFT JOIN partners p ON a.partner_id = p.id
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        LEFT JOIN participants part ON part.id = ap.participant_id
        WHERE ${where}
      )
      /* Effectifs par activite : vrais participants si disponibles, sinon participants_manual */
      , eff AS (
        SELECT
          activity_id,
          MAX(device_name)    AS device_name,
          MAX(device_color)   AS device_color,
          MAX(partner_id)     AS partner_id,
          MAX(partner_name)   AS partner_name,
          MAX(activity_date)  AS activity_date,
          MAX(duration_hours) AS duration_hours,
          MAX(location)       AS location,
          CASE WHEN COUNT(participant_id) > 0
               THEN COUNT(participant_id)::int
               ELSE COALESCE(MAX(participants_manual), 0)::int
          END AS effective_count
        FROM base
        GROUP BY activity_id
      )
    `;

    const totalsQuery = `
      ${baseCte}
      SELECT
        COUNT(*)::int                              AS activities,
        COALESCE(SUM(effective_count), 0)::int    AS participants,
        COALESCE(SUM(duration_hours), 0)::int     AS hours
      FROM eff
    `;

    const genderQuery = `
      ${baseCte}
      SELECT genre, COUNT(participant_id)::int AS count
      FROM base
      WHERE genre IS NOT NULL
      GROUP BY genre
    `;

    const beneficiariesByDeviceQuery = `
      ${baseCte}
      SELECT device_name AS name,
             COALESCE(MAX(device_color), '#FF7900') AS color,
             COALESCE(SUM(effective_count), 0)::int AS value
      FROM eff
      GROUP BY device_name
      ORDER BY value DESC
    `;

    const beneficiariesByPartnerQuery = `
      ${baseCte}
      SELECT pr.name,
             pr.objective_beneficiaries,
             COALESCE(b.value, 0)::int AS value
      FROM partners pr
      LEFT JOIN (
        SELECT partner_id, SUM(effective_count)::int AS value
        FROM eff
        GROUP BY partner_id
      ) b ON b.partner_id = pr.id
      ${partnerId ? "WHERE pr.id = $3" : ""}
      ORDER BY pr.name ASC
    `;

    const recentActivitiesQuery = `
      ${baseCte}
      SELECT activity_id AS id, title, activity_date, partner_name
      FROM (
        SELECT DISTINCT ON (activity_id)
          activity_id, title, activity_date, partner_name
        FROM base
        ORDER BY activity_id, activity_date DESC
      ) t
      ORDER BY activity_date DESC
      LIMIT 5
    `;

    const trendsQuery = `
      ${baseCte}
      , all_months AS (
        SELECT generate_series(
          date_trunc('month', $1::date),
          date_trunc('month', $2::date),
          '1 month'::interval
        ) AS month_start
      )
      , agg AS (
        SELECT date_trunc('month', activity_date) AS month_start,
               COUNT(*)::int                           AS activities,
               COALESCE(SUM(effective_count), 0)::int AS beneficiaries
        FROM eff
        GROUP BY date_trunc('month', activity_date)
      )
      SELECT to_char(m.month_start, 'YYYY-MM')    AS month,
             COALESCE(a.activities, 0)::int        AS activities,
             COALESCE(a.beneficiaries, 0)::int     AS beneficiaries
      FROM all_months m
      LEFT JOIN agg a ON a.month_start = m.month_start
      ORDER BY m.month_start ASC
    `;

    const topDevicesQuery = `
      ${baseCte}
      SELECT device_name AS name,
             COALESCE(SUM(effective_count), 0)::int AS value
      FROM eff
      GROUP BY device_name
      ORDER BY value DESC
      LIMIT 5
    `;

    const topPartnersQuery = `
      ${baseCte}
      SELECT partner_name AS name,
             COALESCE(SUM(effective_count), 0)::int AS value
      FROM eff
      GROUP BY partner_name
      ORDER BY value DESC
      LIMIT 5
    `;

    const locationsQuery = `
      ${baseCte}
      SELECT COALESCE(location, 'Non renseigne') AS name,
             COALESCE(SUM(effective_count), 0)::int AS value
      FROM eff
      GROUP BY COALESCE(location, 'Non renseigne')
      ORDER BY value DESC
      LIMIT 8
    `;

    const dataQualityQuery = `
      ${baseCte},
      scoped_participants AS (
        SELECT DISTINCT participant_id
        FROM base
        WHERE participant_id IS NOT NULL
      ),
      participant_stats AS (
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE (email IS NULL OR email = '') AND (telephone IS NULL OR telephone = ''))::int AS missing_contact,
               COUNT(*) FILTER (WHERE genre IS NULL OR genre = '')::int AS missing_gender
        FROM participants
        WHERE id IN (SELECT participant_id FROM scoped_participants)
      ),
      activity_stats AS (
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE device_id IS NULL)::int AS missing_device,
               COUNT(*) FILTER (WHERE partner_id IS NULL)::int AS missing_partner
        FROM activities a
        WHERE ${where}
      )
      SELECT
        participant_stats.total AS participants_total,
        participant_stats.missing_contact,
        participant_stats.missing_gender,
        activity_stats.total AS activities_total,
        activity_stats.missing_device,
        activity_stats.missing_partner
      FROM participant_stats, activity_stats
    `;

    const alertsPartnersQuery = `
      ${baseCte}
      SELECT pr.name,
             pr.objective_beneficiaries,
             COALESCE(b.value, 0)::int AS value
      FROM partners pr
      LEFT JOIN (
        SELECT partner_id, SUM(effective_count)::int AS value
        FROM eff
        GROUP BY partner_id
      ) b ON b.partner_id = pr.id
      WHERE pr.objective_beneficiaries > 0
      ${partnerId ? "AND pr.id = $3" : ""}
    `;

    const alertsDevicesQuery = `
      SELECT d.name,
             MAX(a.activity_date) AS last_activity
      FROM devices d
      LEFT JOIN activities a ON a.device_id = d.id
      ${partnerId ? "AND a.partner_id = $1" : ""}
      GROUP BY d.name
    `;

    const partnersIsActiveCheck = await pool.query(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'partners'
        AND column_name = 'is_active'
      LIMIT 1
      `
    );
    const partnersActiveWhere =
      partnersIsActiveCheck.rowCount > 0
        ? "(status = 'active' OR is_active = true)"
        : "status = 'active'";

    const partnersActiveQuery = `
      SELECT COUNT(*)::int AS active
      FROM partners
      WHERE ${partnersActiveWhere}
      ${partnerId ? "AND id = $1" : ""}
    `;

    const [totalsRes, genderRes, byDeviceRes, byPartnerRes, recentRes, trendsRes, topDevicesRes, topPartnersRes, locationsRes, dataQualityRes, alertsPartnersRes, alertsDevicesRes, partnersActiveRes] =
      await Promise.all([
        pool.query(totalsQuery, params),
        pool.query(genderQuery, params),
        pool.query(beneficiariesByDeviceQuery, params),
        pool.query(beneficiariesByPartnerQuery, params),
        pool.query(recentActivitiesQuery, params),
        pool.query(trendsQuery, params),
        pool.query(topDevicesQuery, params),
        pool.query(topPartnersQuery, params),
        pool.query(locationsQuery, params),
        pool.query(dataQualityQuery, params),
        pool.query(alertsPartnersQuery, params),
        pool.query(alertsDevicesQuery, partnerId ? [partnerId] : []),
        pool.query(partnersActiveQuery, partnerId ? [partnerId] : []),
      ]);

    const totals = totalsRes.rows[0] || {
      activities: 0,
      participants: 0,
      hours: 0,
    };

    const gender = [
      {
        name: "Hommes",
        value:
          genderRes.rows.find((r) => r.genre === "H")?.count || 0,
        color: "#3B82F6",
      },
      {
        name: "Femmes",
        value:
          genderRes.rows.find((r) => r.genre === "F")?.count || 0,
        color: "#EC4899",
      },
    ];

    const beneficiariesByPartner = byPartnerRes.rows.map((r) => ({
      name: r.name,
      value: r.value,
      objective: r.objective_beneficiaries || 0,
    }));

    const alertsPartners = alertsPartnersRes.rows
      .map((r) => ({
        name: r.name,
        objective: r.objective_beneficiaries || 0,
        value: r.value,
        percent:
          r.objective_beneficiaries > 0
            ? Math.round((r.value / r.objective_beneficiaries) * 100)
            : 0,
      }))
      .filter((r) => r.objective > 0 && r.percent < 50);

    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() - 60);
    const alertsDevices = alertsDevicesRes.rows
      .map((r) => ({
        name: r.name,
        last_activity: r.last_activity,
      }))
      .filter(
        (r) => !r.last_activity || new Date(r.last_activity) < cutoff
      );

    const dq = dataQualityRes.rows[0] || {
      participants_total: 0,
      missing_contact: 0,
      missing_gender: 0,
      activities_total: 0,
      missing_device: 0,
      missing_partner: 0,
    };

    const dataQuality = {
      missing_contact_pct:
        dq.participants_total > 0
          ? Math.round(
              (dq.missing_contact / dq.participants_total) * 100
            )
          : 0,
      missing_gender_pct:
        dq.participants_total > 0
          ? Math.round(
              (dq.missing_gender / dq.participants_total) * 100
            )
          : 0,
      activities_missing_device_pct:
        dq.activities_total > 0
          ? Math.round(
              (dq.missing_device / dq.activities_total) * 100
            )
          : 0,
      activities_missing_partner_pct:
        dq.activities_total > 0
          ? Math.round(
              (dq.missing_partner / dq.activities_total) * 100
            )
          : 0,
    };

    const partnersActive =
      partnersActiveRes.rows[0]?.active || 0;

    res.json({
      meta: { year, from, to },
      totals: {
        activities: totals.activities,
        participants: totals.participants,
        hours: totals.hours,
        partners_active: partnersActive,
      },
      gender,
      beneficiariesByDevice: byDeviceRes.rows,
      beneficiariesByPartner,
      recentActivities: recentRes.rows,
      trends: trendsRes.rows,
      top: {
        devices: topDevicesRes.rows,
        partners: topPartnersRes.rows,
      },
      alerts: {
        partners: alertsPartners,
        devices: alertsDevices,
      },
      dataQuality,
      locations: locationsRes.rows,
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ error: err?.message || "Erreur serveur" });
  }
});

router.get("/export", authMiddleware, async (req, res) => {
  try {
    const { where, params, year } = buildFilters(req);

    const pmColCheck = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'activities' AND column_name = 'participants_manual' LIMIT 1
    `);
    const pmExpr = pmColCheck.rowCount > 0 ? "a.participants_manual" : "NULL::int";

    const exportQuery = `
      WITH base AS (
        SELECT a.id AS activity_id,
               a.activity_date,
               a.partner_id,
               ${pmExpr} AS participants_manual,
               ap.participant_id
        FROM activities a
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        LEFT JOIN participants part ON part.id = ap.participant_id
        WHERE ${where}
      )
      , eff AS (
        SELECT partner_id,
               CASE WHEN COUNT(participant_id) > 0
                    THEN COUNT(participant_id)::int
                    ELSE COALESCE(MAX(participants_manual), 0)::int
               END AS effective_count
        FROM base
        GROUP BY activity_id, partner_id
      )
      SELECT pr.name,
             pr.objective_beneficiaries,
             COALESCE(SUM(b.effective_count), 0)::int AS realized
      FROM partners pr
      LEFT JOIN eff b ON b.partner_id = pr.id
      GROUP BY pr.name, pr.objective_beneficiaries
      ORDER BY pr.name ASC
    `;

    const result = await pool.query(exportQuery, params);

    const rows = result.rows.map((r) => [
      r.name,
      r.realized,
      r.objective_beneficiaries || 0,
    ]);

    const header = ["Partenaire", "Realise", "Objectif"];
    const csv = [header, ...rows]
      .map((r) => r.join(";"))
      .join("\n");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=dashboard_objectifs_${year}.csv`
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send("\ufeff" + csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
