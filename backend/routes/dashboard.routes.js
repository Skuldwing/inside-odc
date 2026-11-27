const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { plafonnerObjectif } = require("../services/reservePartenaire");

const { RETENU_PAR_ACTIVITE } = require("../services/retenuCoach");
const { CAS_ZONE } = require("../services/budget");
const router = express.Router();

/* « reserve_activee » n'existe pas avant la migration de demarrage, et le
   tableau de bord est la premiere page que tout le monde ouvre : on ne veut pas
   qu'il tombe en panne pendant les quelques secondes ou la colonne manque. Un
   COALESCE ne sauverait rien — c'est la lecture de la colonne elle-meme qui
   echoue — alors on regarde le catalogue avant de composer la requete, comme le
   fait deja la verification de « duration_hours » juste a cote. */
async function colonneReservePresente() {
  const { rowCount } = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'reserve_activee' LIMIT 1
  `);
  return rowCount > 0;
}

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

  let coachId = null;
  if (req.user.role === "coach") {
    coachId = req.user.id;
  }

  const deviceId = req.query.device_id || null;
  const gender = req.query.gender || null;

  const params = [from, to];
  let idx = 3;
  let where = "a.activity_date BETWEEN $1 AND LEAST($2::date, CURRENT_DATE)";

  if (coachId) {
    where += ` AND a.coach_id = $${idx++}`;
    params.push(coachId);
  } else {
    if (partnerId) {
      where += ` AND (a.partner_id = $${idx} OR a.coach_id IN (SELECT id FROM users WHERE partner_id = $${idx} AND role = 'coach'))`;
      idx++;
      params.push(partnerId);
    }
    if (deviceId) {
      where += ` AND a.device_id = $${idx++}`;
      params.push(deviceId);
    }
  }
  if (gender) {
    where += ` AND part.genre = $${idx++}`;
    params.push(gender);
  }

  return { where, params, year, from, to, partnerId, coachId };
}

router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const { where, params, year, from, to, partnerId } = buildFilters(req);

    const [durationColCheck, participantsManualColCheck, reservePresente] = await Promise.all([
      pool.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activities' AND column_name = 'duration_hours' LIMIT 1
      `),
      pool.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activities' AND column_name = 'participants_manual' LIMIT 1
      `),
      colonneReservePresente(),
    ]);

    const reserveExpr = reservePresente ? "pr.reserve_activee" : "0";

    const durationExpr =
      durationColCheck.rowCount > 0 ? "a.duration_hours" : "NULL::int";
    const participantsManualExpr =
      participantsManualColCheck.rowCount > 0 ? "a.participants_manual" : "NULL::int";

    const baseCte = `
      WITH base AS (
        SELECT a.id AS activity_id,
               a.title,
               (a.coach_id IS NOT NULL) AS par_coach,
               a.activity_date,
               ${durationExpr} AS duration_hours,
               ${participantsManualExpr} AS participants_manual,
               a.location,
               COALESCE(a.mode, 'presentiel') AS mode,
               a.device_id,
               COALESCE(d.name, uc.full_name, 'Non renseigne') AS device_name,
               COALESCE(d.color, '#FF7900') AS device_color,
               COALESCE(a.partner_id, uc.partner_id) AS partner_id,
               COALESCE(p.name, pa.name, 'Non renseigne') AS partner_name,
               ap.participant_id,
               part.genre
        FROM activities a
        LEFT JOIN devices d ON a.device_id = d.id
        LEFT JOIN partners p ON a.partner_id = p.id
        LEFT JOIN users uc ON a.coach_id = uc.id
        LEFT JOIN partners pa ON pa.id = uc.partner_id
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        LEFT JOIN participants part ON part.id = ap.participant_id
        WHERE ${where}
      )
      /* Effectifs par activite : uniquement les vrais participants importes.
         Un effectif manuel (participants_manual) n'est qu'une estimation non
         verifiee ; il ne compte pas dans les KPIs tant qu'aucune liste reelle
         n'a ete importee, meme si l'activite reste comptee comme realisee. */
      , eff_brut AS (
        SELECT
          activity_id,
          MAX(device_name)    AS device_name,
          MAX(device_color)   AS device_color,
          MAX(partner_id)     AS partner_id,
          MAX(partner_name)   AS partner_name,
          BOOL_OR(par_coach)  AS par_coach,
          MAX(activity_date)  AS activity_date,
          MAX(duration_hours) AS duration_hours,
          MAX(location)       AS location,
          MAX(mode)           AS mode,
          CASE WHEN COUNT(participant_id) > 0
               THEN COUNT(participant_id)::int
               ELSE 0
          END AS effective_count,
          CASE WHEN COUNT(participant_id) > 0
               THEN COUNT(participant_id)::int
               ELSE COALESCE(MAX(participants_manual), 0)::int
          END AS estimated_count
        FROM base
        GROUP BY activity_id
        HAVING COUNT(participant_id) > 0 OR COALESCE(MAX(participants_manual), 0) > 0
      )
      /* Une activité de coach ne compte que pour sa part retenue dans
         l'objectif du coach — le surplus est en réserve, hors des chiffres du
         coach comme de son partenaire (services/retenuCoach.js). Avec un filtre
         de genre, la part retenue s'applique en proportion. */
      , eff AS (
        SELECT e.activity_id, e.device_name, e.device_color, e.partner_id, e.partner_name,
               e.par_coach, e.activity_date, e.duration_hours, e.location, e.mode,
               CASE WHEN r.coach_id IS NOT NULL AND r.participations > 0
                    THEN ROUND(e.effective_count::numeric * r.retenu / r.participations)::int
                    ELSE e.effective_count END AS effective_count,
               CASE WHEN r.coach_id IS NOT NULL AND r.participations > 0 AND e.effective_count > 0
                    THEN ROUND(e.effective_count::numeric * r.retenu / r.participations)::int
                    ELSE e.estimated_count END AS estimated_count,
               /* Ce que l'objectif du coach a écarté : la réserve des coachs. */
               CASE WHEN r.coach_id IS NOT NULL AND r.participations > 0
                    THEN e.effective_count - ROUND(e.effective_count::numeric * r.retenu / r.participations)::int
                    ELSE 0 END AS reserve_coach
        FROM eff_brut e
        LEFT JOIN (${RETENU_PAR_ACTIVITE}) r ON r.activity_id = e.activity_id
      )
    `;

    const totalsQuery = `
      ${baseCte}
      SELECT
        COUNT(*)::int                                AS activities,
        COALESCE(SUM(effective_count), 0)::int      AS participants,
        COALESCE(SUM(estimated_count), 0)::int      AS participants_estimated,
        COALESCE(SUM(duration_hours), 0)::int       AS hours,
        COALESCE(SUM(reserve_coach), 0)::int        AS reserve_coachs
      FROM eff
    `;

    /* Les totaux, repartis par partenaire pour pouvoir leur appliquer le
     * plafond avant de les additionner.
     *
     * Le grand chiffre du tableau de bord ne doit pas compter ce qui attend en
     * reserve : tant qu'un administrateur n'a pas libere le surplus d'un
     * partenaire, ce surplus n'existe pas pour les indicateurs.
     *
     * Le regroupement part de « eff » et non de « partners » : ainsi chaque
     * participation tombe dans exactement un seau. Une activite sans partenaire
     * — ou rattachee a un partenaire efface — se retrouve dans un seau sans
     * objectif, donc comptee en entier, ce qui est la bonne reponse. Partir de
     * « partners » aurait fait disparaitre ces participations du total.
     *
     * « manuel » isole la part purement estimee — un effectif saisi a la main,
     * sans liste nominative. Elle n'entre pas dans le plafond puisqu'elle
     * n'entre pas non plus dans l'objectif ; elle est simplement rajoutee au
     * chiffre « estimes ». */
    const totauxParPartenaireQuery = `
      ${baseCte}
      SELECT e.partner_id,
             COALESCE(pr.objective_beneficiaries, 0)::int AS objective_beneficiaries,
             COALESCE(${reserveExpr}, 0)::int             AS reserve_activee,
             COALESCE(SUM(e.effective_count), 0)::int     AS effectif,
             COALESCE(SUM(e.estimated_count - e.effective_count), 0)::int AS manuel
      FROM eff e
      LEFT JOIN partners pr ON pr.id = e.partner_id
      /* Sur la cle primaire de « partners » : ses autres colonnes en dependent
         fonctionnellement. Les enumerer serait impossible ici, puisque la
         colonne de reserve est remplacee par un litteral tant que la migration
         n'a pas tourne — et « GROUP BY 0 » designerait une position. */
      GROUP BY e.partner_id, pr.id
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
             ${reserveExpr}::int AS reserve_activee,
             COALESCE(b.value, 0)::int AS value,
             COALESCE(b.value_coachs, 0)::int AS value_coachs
      FROM partners pr
      LEFT JOIN (
        SELECT partner_id, SUM(effective_count)::int AS value,
               SUM(effective_count) FILTER (WHERE par_coach)::int AS value_coachs
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
        /* Un partenaire ne voit que des chiffres du travail de ses coachs,
           pas leurs activités. */
        ${req.user.role === "partner" ? "WHERE NOT par_coach" : ""}
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

    const beneficiariesByModeQuery = `
      ${baseCte}
      SELECT
        CASE WHEN mode = 'ligne' THEN 'Ligne' ELSE 'Présentiel' END AS name,
        COALESCE(SUM(effective_count), 0)::int AS value,
        COUNT(DISTINCT activity_id)::int AS activities_count,
        CASE WHEN mode = 'ligne' THEN '#6366f1' ELSE '#f97316' END AS color
      FROM eff
      GROUP BY mode
      ORDER BY value DESC
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
             ${reserveExpr}::int AS reserve_activee,
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

    const alertsDevicesQuery = partnerId
      ? `
        SELECT d.name,
               MAX(a.activity_date) AS last_activity
        FROM devices d
        JOIN partner_devices pd ON pd.device_id = d.id AND pd.partner_id = $1
        LEFT JOIN activities a ON a.device_id = d.id AND a.partner_id = $1
        GROUP BY d.name
      `
      : `
        SELECT d.name,
               MAX(a.activity_date) AS last_activity
        FROM devices d
        LEFT JOIN activities a ON a.device_id = d.id
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

    const [totalsRes, genderRes, byDeviceRes, byPartnerRes, recentRes, trendsRes, topDevicesRes, topPartnersRes, locationsRes, dataQualityRes, alertsPartnersRes, alertsDevicesRes, partnersActiveRes, byModeRes, totauxPartRes] =
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
        pool.query(beneficiariesByModeQuery, params),
        pool.query(totauxParPartenaireQuery, params),
      ]);

    const totals = totalsRes.rows[0] || {
      activities: 0,
      participants: 0,
      participants_estimated: 0,
      hours: 0,
    };

    /* Le grand chiffre, plafonne partenaire par partenaire puis additionne.
     *
     * On ne peut pas plafonner le total d'un coup : le plafond est par
     * partenaire, et un partenaire en dessous de son objectif ne compense pas
     * celui qui l'a depasse. On applique donc la regle a chaque seau, et on
     * somme ensuite. */
    const totauxPlafonnes = totauxPartRes.rows.reduce(
      (acc, r) => {
        const calcul = plafonnerObjectif({
          objectif: r.objective_beneficiaries,
          realise: r.effectif,
          reserve_activee: r.reserve_activee,
        });
        acc.retenu += calcul.retenu;
        acc.en_reserve += calcul.reserve_disponible;
        acc.estime += calcul.retenu + Math.max(0, Number(r.manuel) || 0);
        return acc;
      },
      { retenu: 0, en_reserve: 0, estime: 0 }
    );

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

    /* Le realise d'un partenaire est retenu a son objectif, et ce qu'il a fait
       au-dela attend en reserve qu'un administrateur en dispose. « value » reste
       le compte brut — c'est lui qu'on additionne, c'est lui qui est vrai — et
       « reserve » dit ce qui est porte au credit du partenaire aujourd'hui.
       L'ecran affiche le second et mentionne le premier.

       La periode entre en jeu : l'objectif n'a pas de dimension temporelle dans
       la base, alors que ce tableau est filtre par annee ou par mois. Sur un
       mois ou le partenaire n'a pas atteint son objectif, il n'y a pas de
       surplus, donc rien a liberer — le service ramene la part liberee a ce qui
       existe reellement dans ce qu'on regarde. */
    const beneficiariesByPartner = byPartnerRes.rows.map((r) => {
      const calcul = plafonnerObjectif({
        objectif: r.objective_beneficiaries,
        realise: r.value,
        reserve_activee: r.reserve_activee,
      });
      return {
        name: r.name,
        value: r.value,
        /* La part réalisée par les coachs rattachés au partenaire, comprise
           dans « value » et affichée à part. */
        value_coachs: r.value_coachs || 0,
        objective: r.objective_beneficiaries || 0,
        reserve: calcul,
      };
    });

    const alertsPartners = alertsPartnersRes.rows
      .map((r) => {
        const calcul = plafonnerObjectif({
          objectif: r.objective_beneficiaries,
          realise: r.value,
          reserve_activee: r.reserve_activee,
        });
        return {
          name: r.name,
          objective: calcul.objectif,
          value: r.value,
          /* Le meme pourcentage qu'ailleurs, calcule sur le realise retenu.
             Sans cela un partenaire pourrait etre signale « sous les 50 % » ici
             et affiche a 100 % deux cartes plus haut. */
          percent: calcul.pourcentage,
          reserve: calcul,
        };
      })
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

    /* D'où vient le grand chiffre, ligne par ligne.
     *
     * La page Participants compte toutes les inscriptions de toutes les
     * listes ; le tableau de bord, celles de la période choisie et déjà
     * réalisées, moins ce qui dépasse les objectifs, plus les effectifs
     * estimés des activités sans liste. Trois chiffres justes, mais sans le
     * chemin de l'un à l'autre, ils passaient pour contradictoires.
     *
     * Chaque ligne se déduit des autres : la somme tombe juste, à l'unité.
     * Réservé aux administrateurs, comme la réserve des coachs. */
    let rapprochement = null;
    if (req.user.role === "admin") {
      const CONDITION_DATES = "a.activity_date BETWEEN $1 AND LEAST($2::date, CURRENT_DATE)";
      /* Les mêmes filtres (partenaire, dispositif, genre), toutes dates. Les
         deux bornes restent citées pour que la requête garde ses paramètres. */
      const sansDates = where.replace(
        CONDITION_DATES,
        "($1::date IS NULL OR $2::date IS NULL OR TRUE)"
      );
      const { rows: [h] } = await pool.query(
        `SELECT COUNT(ap.participant_id)::int AS toutes,
                COUNT(ap.participant_id) FILTER (WHERE a.activity_date > CURRENT_DATE)::int AS a_venir
           FROM activities a
           JOIN activity_participants ap ON ap.activity_id = a.id
           LEFT JOIN participants part ON part.id = ap.participant_id
          WHERE ${sansDates}`,
        params
      );
      const periode = Number(totals.participants || 0) + Number(totals.reserve_coachs || 0);
      rapprochement = {
        inscriptions_toutes_periodes: h.toutes,
        hors_periode: Math.max(0, h.toutes - h.a_venir - periode),
        a_venir: h.a_venir,
        inscriptions_periode: periode,
        reserve_coachs: Number(totals.reserve_coachs || 0),
        reserve_partenaires: Number(totals.participants || 0) - totauxPlafonnes.retenu,
        enregistres: totauxPlafonnes.retenu,
        sans_liste: totauxPlafonnes.estime - totauxPlafonnes.retenu,
        estimes: totauxPlafonnes.estime,
      };
    }

    res.json({
      meta: { year, from, to },
      rapprochement,
      totals: {
        activities: totals.activities,
        /* Ce qui est compte : le realise de chaque partenaire retenu a son
           objectif, plus ce qui ne depend d'aucun objectif. */
        participants: totauxPlafonnes.retenu,
        /* Et ce qui existe vraiment. Les deux sont renvoyes parce qu'aucun des
           deux ne se suffit : le premier est le chiffre qu'on publie, le second
           est celui qui sert de denominateur a toute proportion — une
           repartition hommes / femmes calculee sur un total bride donnerait des
           pourcentages au-dela de cent. */
        participants_reels: totals.participants,
        participants_en_reserve: totauxPlafonnes.en_reserve,
        /* Le surplus des coachs au-delà de leurs objectifs, retiré de tous les
           chiffres ci-dessus. Dit aux administrateurs seulement. */
        ...(req.user.role === "admin" ? { participants_reserve_coachs: totals.reserve_coachs } : {}),
        participants_estimated: totauxPlafonnes.estime,
        participants_estimated_reels: totals.participants_estimated,
        hours: totals.hours,
        partners_active: partnersActive,
      },
      gender,
      beneficiariesByDevice: byDeviceRes.rows,
      beneficiariesByMode: byModeRes.rows,
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

/* ===== LE TRAVAIL DES COACHS =====
 *
 * Par coach : la part retenue dans son objectif, par modalité — en ligne,
 * Dakar, région — sur la période du tableau de bord. La réserve (ce qui
 * dépasse l'objectif) n'est donnée qu'au coach lui-même et aux
 * administrateurs : un partenaire ne voit que ce qui compte.
 *
 *  - partenaire : ses coachs, chiffres retenus seulement ;
 *  - coach      : lui seul, avec son objectif et sa réserve ;
 *  - admin      : les coachs du partenaire demandé, réserve comprise.
 */
router.get("/coachs", authMiddleware, async (req, res) => {
  try {
    const { params } = buildFilters(req);
    const [du, au] = params;
    const role = req.user.role;
    let filtre;
    let cle;
    if (role === "partner") {
      if (!req.user.partner_id) return res.json({ coachs: [], reserve_visible: false });
      filtre = "u.partner_id = $3";
      cle = req.user.partner_id;
    } else if (role === "coach") {
      filtre = "u.id = $3";
      cle = req.user.id;
    } else if (role === "admin") {
      if (!req.query.partner_id) return res.json({ coachs: [], reserve_visible: true });
      filtre = "u.partner_id = $3";
      cle = Number(req.query.partner_id);
    } else {
      return res.json({ coachs: [], reserve_visible: false });
    }
    const voitReserve = role !== "partner";
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name,
              COALESCE(u.objective_beneficiaries, 0)::int AS objectif,
              COALESCE(SUM(x.retenu) FILTER (WHERE x.zone = 'ligne'), 0)::int AS en_ligne,
              COALESCE(SUM(x.retenu) FILTER (WHERE x.zone = 'dakar'), 0)::int AS dakar,
              COALESCE(SUM(x.retenu) FILTER (WHERE x.zone = 'region'), 0)::int AS region,
              COALESCE(SUM(x.retenu) FILTER (WHERE x.zone = 'non_renseigne'), 0)::int AS non_renseigne,
              COALESCE(SUM(x.retenu), 0)::int AS total,
              COALESCE(SUM(x.participations - x.retenu), 0)::int AS reserve_periode,
              (SELECT COALESCE(SUM(r2.retenu), 0) FROM activities a2
                 JOIN (${RETENU_PAR_ACTIVITE}) r2 ON r2.activity_id = a2.id
                WHERE a2.coach_id = u.id)::int AS retenu_total,
              (SELECT COALESCE(SUM(r2.participations - r2.retenu), 0) FROM activities a2
                 JOIN (${RETENU_PAR_ACTIVITE}) r2 ON r2.activity_id = a2.id
                WHERE a2.coach_id = u.id)::int AS reserve_totale
         FROM users u
         LEFT JOIN (
           SELECT a.coach_id, ${CAS_ZONE} AS zone, r.retenu, r.participations
             FROM activities a
             JOIN (${RETENU_PAR_ACTIVITE}) r ON r.activity_id = a.id
            WHERE a.activity_date BETWEEN $1 AND LEAST($2::date, CURRENT_DATE)
         ) x ON x.coach_id = u.id
        WHERE u.role = 'coach' AND ${filtre}
        GROUP BY u.id
        ORDER BY COALESCE(SUM(x.retenu), 0) DESC, u.full_name`,
      [du, au, cle]
    );
    res.json({
      reserve_visible: voitReserve,
      coachs: rows.map((r) => {
        const ligne = {
          id: r.id, nom: r.full_name, en_ligne: r.en_ligne, dakar: r.dakar,
          region: r.region, non_renseigne: r.non_renseigne, total: r.total,
        };
        if (voitReserve) {
          Object.assign(ligne, {
            objectif: r.objectif,
            retenu_total: r.retenu_total,
            reserve_periode: r.reserve_periode,
            reserve_totale: r.reserve_totale,
          });
        }
        return ligne;
      }),
    });
  } catch (err) {
    console.error("[DASHBOARD COACHS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/export", authMiddleware, async (req, res) => {
  try {
    const { where, params, year } = buildFilters(req);

    const [pmColCheck, reservePresente] = await Promise.all([
      pool.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activities' AND column_name = 'participants_manual' LIMIT 1
      `),
      colonneReservePresente(),
    ]);
    const pmExpr = pmColCheck.rowCount > 0 ? "a.participants_manual" : "NULL::int";
    const reserveExpr = reservePresente ? "pr.reserve_activee" : "0";

    const exportQuery = `
      WITH base AS (
        SELECT a.id AS activity_id,
               a.activity_date,
               /* Comme l'écran : le travail d'un coach compte pour son partenaire. */
               COALESCE(a.partner_id, uc_exp.partner_id) AS partner_id,
               (a.coach_id IS NOT NULL) AS par_coach,
               ${pmExpr} AS participants_manual,
               ap.participant_id
        FROM activities a
        LEFT JOIN users uc_exp ON uc_exp.id = a.coach_id
        LEFT JOIN activity_participants ap ON ap.activity_id = a.id
        LEFT JOIN participants part ON part.id = ap.participant_id
        WHERE ${where}
      )
      , eff AS (
        SELECT activity_id, partner_id,
               CASE WHEN COUNT(participant_id) > 0
                    THEN COUNT(participant_id)::int
                    ELSE 0
               END AS effective_count,
               BOOL_OR(par_coach) AS par_coach
        FROM base
        GROUP BY activity_id, partner_id
      )
      , eff_retenu AS (
        SELECT b.partner_id, b.par_coach,
               CASE WHEN r.coach_id IS NOT NULL AND r.participations > 0
                    THEN ROUND(b.effective_count::numeric * r.retenu / r.participations)::int
                    ELSE b.effective_count END AS effective_count
        FROM eff b
        LEFT JOIN (${RETENU_PAR_ACTIVITE}) r ON r.activity_id = b.activity_id
      )
      SELECT pr.name,
             pr.objective_beneficiaries,
             ${reserveExpr}::int AS reserve_activee,
             COALESCE(SUM(b.effective_count), 0)::int AS realized,
             COALESCE(SUM(b.effective_count) FILTER (WHERE b.par_coach), 0)::int AS realized_coachs
      FROM partners pr
      LEFT JOIN eff_retenu b ON b.partner_id = pr.id
      /* Sur la cle primaire : les autres colonnes de « pr » en dependent
         fonctionnellement, donc Postgres les accepte sans les enumerer. C'est
         necessaire ici parce que la colonne de reserve peut etre remplacee par
         un litteral quand la migration n'a pas encore tourne, et « GROUP BY 0 »
         serait lu comme une position de colonne. Au passage, deux partenaires
         homonymes ne sont plus fondus en une ligne — l'ecran les distinguait
         deja. */
      GROUP BY pr.id
      ORDER BY pr.name ASC
    `;

    const result = await pool.query(exportQuery, params);

    /* Quatre colonnes au lieu de trois. « Realise retenu » est le chiffre de
       l'ecran, celui qui vaut pour l'objectif ; « Realise brut » est le compte
       entier. Les deux figurent parce qu'un export sert a justifier : donner le
       chiffre bride sans dire qu'il l'est reviendrait a cacher du travail fait,
       et donner le brut seul reviendrait a contredire le tableau de bord. */
    const rows = result.rows.map((r) => {
      const calcul = plafonnerObjectif({
        objectif: r.objective_beneficiaries,
        realise: r.realized,
        reserve_activee: r.reserve_activee,
      });
      return [
        r.name,
        calcul.retenu,
        calcul.objectif,
        calcul.brut,
        r.realized_coachs,
        calcul.reserve_disponible,
      ];
    });

    const header = ["Partenaire", "Realise retenu", "Objectif", "Realise brut", "Dont coachs", "En reserve"];
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
