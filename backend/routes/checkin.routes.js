const express = require("express");
const pool = require("../db");

const router = express.Router();

function isFormOpen(activityDate) {
  const deadline = new Date(activityDate);
  deadline.setUTCHours(23, 59, 59, 999);
  return new Date() <= deadline;
}

/* ── GET /checkin/:activityId — info publique sur l'activite ── */
router.get("/:activityId", async (req, res) => {
  try {
    const { activityId } = req.params;
    const result = await pool.query(
      `SELECT a.id, a.title, a.description, a.activity_date, a.location,
              p.name AS partner_name, d.name AS device_name,
              COALESCE(ap.cnt, 0)::int AS participants_count
       FROM activities a
       LEFT JOIN partners p ON p.id = a.partner_id
       LEFT JOIN devices d ON d.id = a.device_id
       LEFT JOIN (SELECT activity_id, COUNT(*)::int AS cnt FROM activity_participants GROUP BY activity_id) ap
              ON ap.activity_id = a.id
       WHERE a.id = $1`,
      [activityId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Activite introuvable" });
    }
    const activity = result.rows[0];
    activity.is_open = isFormOpen(activity.activity_date);
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ── POST /checkin/:activityId — enregistrement presence ── */
router.post("/:activityId", async (req, res) => {
  const client = await pool.connect();
  try {
    const { activityId } = req.params;
    const { nom, prenom, telephone, email, genre, structure, tranche_age } = req.body || {};

    if (!nom || !prenom) {
      return res.status(400).json({ error: "Nom et prenom requis" });
    }

    // Vérifie que l'activité existe
    const actRes = await client.query("SELECT id, title, activity_date FROM activities WHERE id = $1", [activityId]);
    if (!actRes.rows.length) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (!isFormOpen(actRes.rows[0].activity_date)) {
      return res.status(403).json({ error: "La periode d'inscription est cloturee.", closed: true });
    }

    await client.query("BEGIN");

    // Cherche participant existant par tel ou email
    let participantId = null;
    if (telephone) {
      const byTel = await client.query(
        "SELECT id FROM participants WHERE telephone = $1 LIMIT 1",
        [telephone.trim()]
      );
      if (byTel.rows.length) participantId = byTel.rows[0].id;
    }
    if (!participantId && email) {
      const byEmail = await client.query(
        "SELECT id FROM participants WHERE lower(email) = lower($1) LIMIT 1",
        [email.trim()]
      );
      if (byEmail.rows.length) participantId = byEmail.rows[0].id;
    }

    // Crée participant si nouveau
    if (!participantId) {
      const ins = await client.query(
        `INSERT INTO participants (nom, prenom, telephone, email, genre, structure, age_range, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Participant')
         RETURNING id`,
        [
          nom.trim(),
          prenom.trim(),
          telephone?.trim() || null,
          email?.trim() || null,
          genre || null,
          structure?.trim() || null,
          tranche_age || null,
        ]
      );
      participantId = ins.rows[0].id;
    }

    // Vérifie doublon dans cette activité
    const already = await client.query(
      "SELECT 1 FROM activity_participants WHERE activity_id = $1 AND participant_id = $2",
      [activityId, participantId]
    );
    if (already.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Presence deja enregistree pour cette activite.",
        already: true,
      });
    }

    await client.query(
      "INSERT INTO activity_participants (activity_id, participant_id) VALUES ($1, $2)",
      [activityId, participantId]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      message: "Presence enregistree avec succes !",
      activity: actRes.rows[0].title,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

module.exports = router;
