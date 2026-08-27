const pool = require("../db");

const WEIGHTS = {
  participants: 0.35,
  proof: 0.25,
  metadata: 0.15,
  duplicates: 0.15,
  timeliness: 0.10,
};

const DEFAULT_THRESHOLD = 60;

async function getReliabilityThreshold() {
  const result = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'reliability_threshold'`
  );
  const threshold = result.rows[0]?.value?.threshold;
  return typeof threshold === "number" ? threshold : DEFAULT_THRESHOLD;
}

async function setReliabilityThreshold(threshold) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('reliability_threshold', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = NOW()`,
    [JSON.stringify({ threshold })]
  );
}

/* Repère une activité déclarée par le même partenaire/coach, le même jour :
   ne flag que l'entrée la plus récente, pointée vers la première du lot. */
async function findDuplicateActivity(activity) {
  if (!activity.partner_id && !activity.coach_id) return null;

  const conditions = ["id != $1", "activity_date = $2"];
  const params = [activity.id, activity.activity_date];

  if (activity.partner_id) {
    params.push(activity.partner_id);
    conditions.push(`partner_id = $${params.length}`);
  } else {
    params.push(activity.coach_id);
    conditions.push(`coach_id = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT id FROM activities WHERE ${conditions.join(" AND ")} ORDER BY created_at ASC LIMIT 1`,
    params
  );
  return result.rows[0]?.id ?? null;
}

function scoreTimeliness(activityDate, createdAt) {
  const diffDays = Math.floor(
    (new Date(createdAt) - new Date(activityDate)) / (1000 * 60 * 60 * 24)
  );
  if (diffDays <= 0) return { score: 100, days_late: Math.max(diffDays, 0) };
  if (diffDays <= 7) return { score: 70, days_late: diffDays };
  if (diffDays <= 30) return { score: 40, days_late: diffDays };
  return { score: 10, days_late: diffDays };
}

async function computeAndStoreReliability(activityId) {
  const activityRes = await pool.query(
    `SELECT id, activity_date, created_at, device_id, partner_id, coach_id, location,
            duration_hours, report_filename, reliability_manual_override, reliability_status
     FROM activities WHERE id = $1`,
    [activityId]
  );
  const activity = activityRes.rows[0];
  if (!activity) return null;

  const participantsRes = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE p.email IS NULL AND p.telephone IS NULL)::int AS missing_contact
     FROM activity_participants ap
     JOIN participants p ON p.id = ap.participant_id
     WHERE ap.activity_id = $1`,
    [activityId]
  );
  const realCount = participantsRes.rows[0].total;
  const missingContact = participantsRes.rows[0].missing_contact;

  const participantsScore =
    realCount > 0 ? Math.round(((realCount - missingContact) / realCount) * 100) : 20;

  const proofScore = activity.report_filename ? 100 : 0;

  const metaFields = [
    activity.device_id,
    activity.partner_id || activity.coach_id,
    activity.location,
    activity.duration_hours,
  ];
  const filledMeta = metaFields.filter((v) => v !== null && v !== undefined && v !== "").length;
  const metadataScore = Math.round((filledMeta / metaFields.length) * 100);

  const duplicateOfId = await findDuplicateActivity(activity);
  const duplicatesScore = duplicateOfId ? 0 : 100;

  const timeliness = scoreTimeliness(activity.activity_date, activity.created_at);

  const rawScore =
    participantsScore * WEIGHTS.participants +
    proofScore * WEIGHTS.proof +
    metadataScore * WEIGHTS.metadata +
    duplicatesScore * WEIGHTS.duplicates +
    timeliness.score * WEIGHTS.timeliness;
  const score = Math.round(rawScore * 100) / 100;

  const threshold = await getReliabilityThreshold();

  const details = {
    threshold,
    criteria: {
      participants: { score: participantsScore, weight: WEIGHTS.participants, real_count: realCount, missing_contact: missingContact },
      proof: { score: proofScore, weight: WEIGHTS.proof, has_report: Boolean(activity.report_filename) },
      metadata: { score: metadataScore, weight: WEIGHTS.metadata, filled: filledMeta, total: metaFields.length },
      duplicates: { score: duplicatesScore, weight: WEIGHTS.duplicates, duplicate_of: duplicateOfId },
      timeliness: { score: timeliness.score, weight: WEIGHTS.timeliness, days_late: timeliness.days_late },
    },
  };

  const status = activity.reliability_manual_override
    ? activity.reliability_status
    : score >= threshold
      ? "validee"
      : "a_verifier";

  await pool.query(
    `UPDATE activities
     SET reliability_score = $1,
         reliability_details = $2::jsonb,
         reliability_status = $3,
         duplicate_of = $4
     WHERE id = $5`,
    [score, JSON.stringify(details), status, duplicateOfId, activityId]
  );

  return { score, status, details };
}

module.exports = {
  computeAndStoreReliability,
  getReliabilityThreshold,
  setReliabilityThreshold,
};
