/**
 * Les inscriptions en réserve, une à une.
 *
 * La réserve était une quantité : « 34 au-delà de l'objectif ». Les chiffres
 * la retiraient, mais la page Participants montrait toutes les lignes — on y
 * voyait donc des bénéficiaires que rien d'autre ne comptait, avant qu'un
 * administrateur ait décidé de les libérer.
 *
 * Pour les retirer de la liste, il faut dire lesquelles. La règle est celle
 * des coachs (services/retenuCoach.js), étendue aux partenaires : l'objectif
 * se remplit dans l'ordre des dates, les premières inscriptions sont
 * retenues, les plus récentes partent en réserve. Dans une activité coupée par
 * la limite, l'ordre est celui des fiches.
 *
 *   1. Réserve du coach : dans une activité de coach, les lignes au-delà de la
 *      part retenue dans son objectif. Elle ne se libère pas.
 *   2. Réserve du partenaire : sur ce qui reste — ses activités et la part
 *      retenue de ses coachs —, les lignes au-delà de son objectif augmenté
 *      de la réserve qu'un administrateur a libérée sur sa fiche.
 *
 * Le nombre de lignes retenues est exactement celui de la fiche partenaire
 * (plafonnerObjectif sur toutes les dates) : libérer 20 sur la fiche fait
 * réapparaître 20 lignes ici, les premières de la réserve.
 */

const { RETENU_PAR_ACTIVITE } = require("./retenuCoach");

/**
 * @param {boolean} reservePresente  la colonne partners.reserve_activee existe
 * @returns {string} une requête qui rend (activity_id, participant_id, motif)
 *   pour chaque inscription en réserve — motif « coach » ou « partenaire ».
 */
function lignesEnReserve(reservePresente = true) {
  const liberee = reservePresente ? "COALESCE(pr.reserve_activee, 0)" : "0";
  return `
    SELECT z.activity_id, z.participant_id,
           CASE WHEN z.reserve_coach THEN 'coach' ELSE 'partenaire' END AS motif
    FROM (
      SELECT h.*,
             ROW_NUMBER() OVER (
               PARTITION BY h.partner_id, h.reserve_coach
               ORDER BY h.activity_date NULLS LAST, h.activity_id, h.rang_activite
             ) AS rang_partenaire
      FROM (
        SELECT ap.activity_id, ap.participant_id, a.activity_date,
               COALESCE(a.partner_id, uc.partner_id) AS partner_id,
               ROW_NUMBER() OVER (PARTITION BY ap.activity_id ORDER BY ap.participant_id) AS rang_activite,
               (r.coach_id IS NOT NULL
                 AND ROW_NUMBER() OVER (PARTITION BY ap.activity_id ORDER BY ap.participant_id) > r.retenu
               ) AS reserve_coach
        FROM activity_participants ap
        JOIN activities a ON a.id = ap.activity_id
        LEFT JOIN users uc ON uc.id = a.coach_id
        JOIN (${RETENU_PAR_ACTIVITE}) r ON r.activity_id = a.id
      ) h
    ) z
    LEFT JOIN partners pr ON pr.id = z.partner_id
    WHERE z.reserve_coach
       OR (pr.id IS NOT NULL
           AND COALESCE(pr.objective_beneficiaries, 0) > 0
           AND z.rang_partenaire > COALESCE(pr.objective_beneficiaries, 0) + ${liberee})
  `;
}

module.exports = { lignesEnReserve };

const pool = require("../db");

/* « reserve_activee » n'existe qu'après la migration de démarrage : on regarde
   le catalogue avant de composer la requête, comme le tableau de bord. */
async function colonneReservePresente() {
  const { rowCount } = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'partners' AND column_name = 'reserve_activee' LIMIT 1
  `);
  return rowCount > 0;
}

/**
 * Ce que la page Participants montre de la réserve.
 *
 * Personne n'y voit une inscription en réserve tant qu'un administrateur ne
 * l'a pas libérée. L'administrateur peut seulement demander à la voir
 * (« avec » : toute la liste, réserve signalée ; « seule » : la réserve
 * seule), pour décider de la libérer en connaissance de cause.
 */
async function reservePourLaPage(req) {
  const demande = req.user?.role === "admin" ? String(req.query?.reserve || "") : "";
  const mode = demande === "avec" ? "inclure" : demande === "seule" ? "seule" : "exclure";
  return { sql: lignesEnReserve(await colonneReservePresente()), mode };
}

module.exports.colonneReservePresente = colonneReservePresente;
module.exports.reservePourLaPage = reservePourLaPage;
