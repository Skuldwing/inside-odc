/**
 * La part retenue du travail d'un coach.
 *
 * Un coach a un objectif (« objective_beneficiaries »), confié sur celui de son
 * partenaire. Ce qu'il réalise au-delà n'est porté ni à son crédit ni à celui
 * de son partenaire : c'est une réserve, que seuls le coach et les
 * administrateurs voient, et qui ne se libère pas.
 *
 * L'objectif se remplit dans l'ordre des dates : les premières participations
 * sont retenues, celles qui viennent après l'avoir atteint partent en réserve.
 * Une activité à cheval sur la limite est coupée — sa part restante est
 * retenue, le reste mis de côté. C'est ce qui permet de dire, activité par
 * activité et donc modalité par modalité (en ligne, Dakar, région), ce qui
 * compte et ce qui ne compte pas.
 *
 * Sans objectif, pas de plafond : un coach dont l'objectif vaut zéro garde
 * tout, comme un partenaire sans engagement chiffré. Seules comptent les
 * participations des listes nominatives, comme partout ailleurs dans les
 * indicateurs.
 *
 * Le calcul porte sur tout l'historique du coach, sans période : l'objectif
 * n'en a pas. Une vue sur un mois prend ensuite la part retenue des activités
 * de ce mois.
 *
 * Renvoie, pour chaque activité : participations (le compte brut), retenu, et
 * coach_id quand l'activité est celle d'un coach.
 */
const RETENU_PAR_ACTIVITE = `
  SELECT x.id AS activity_id,
         x.coach_id,
         x.n::int AS participations,
         (CASE WHEN x.coach_id IS NULL OR x.obj <= 0 THEN x.n
               ELSE GREATEST(0, LEAST(x.n, x.obj - x.avant)) END)::int AS retenu
  FROM (
    SELECT a.id,
           uc.id AS coach_id,
           COALESCE(uc.objective_beneficiaries, 0) AS obj,
           COALESCE(c.n, 0) AS n,
           COALESCE(SUM(COALESCE(c.n, 0)) OVER (
             PARTITION BY uc.id
             ORDER BY a.activity_date NULLS LAST, a.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS avant
    FROM activities a
    LEFT JOIN users uc ON uc.id = a.coach_id AND uc.role = 'coach'
    LEFT JOIN (
      SELECT activity_id, COUNT(*)::int AS n FROM activity_participants GROUP BY activity_id
    ) c ON c.activity_id = a.id
  ) x
`;

module.exports = { RETENU_PAR_ACTIVITE };
