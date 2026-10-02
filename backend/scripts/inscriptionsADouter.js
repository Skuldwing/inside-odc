/**
 * Qui, dans une activité, n'y était peut-etre pas — en ligne de commande.
 *
 * Deux beneficiaires ont ecrit qu'ils avaient recu une attestation pour une
 * session qu'ils n'avaient pas suivie. L'ecran repond a cette question
 * depuis la plateforme ; ce script y repond depuis le conteneur, quand on
 * veut le chiffre tout de suite, ou qu'on veut le passer sur une activite
 * que personne n'a signalee.
 *
 * Il reutilise la connexion de l'application : meme DATABASE_URL, meme
 * reglage SSL. Aucun identifiant a saisir ni a copier.
 *
 * Lecture seule. Rien n'est modifie, rien n'est supprime.
 *
 *   cd backend && ACTIVITE=204 NOM=ndeme node scripts/inscriptionsADouter.js
 */
const ACTIVITE = Number(process.env.ACTIVITE || 204);
const NOM = process.env.NOM || "ndeme";

/* Depuis « scripts/ », le pool est juste au-dessus. Les autres chemins sont
   des replis pour les conteneurs ou le backend n'est pas a la meme place. */
const chemin = require("path");
let pool;
for (const c of [chemin.join(__dirname, "..", "db"),
                 chemin.resolve(process.cwd(), "db"),
                 chemin.resolve(process.cwd(), "backend/db")]) {
  try { pool = require(c); break; } catch { /* on essaie le suivant */ }
}
if (!pool) {
  console.error("db.js introuvable — lancez ce script depuis le dossier backend.");
  process.exit(1);
}

(async () => {
  const q = (s, p) => pool.query(s, p).then((r) => r.rows);

  const [ampleur] = await q(`
    SELECT COUNT(*)::int AS inscrits,
           COUNT(*) FILTER (WHERE p.created_at < a.created_at)::int AS fiches_anterieures,
           COUNT(*) FILTER (WHERE p.created_at < a.created_at AND au.n > 0)::int AS a_relire,
           COUNT(*) FILTER (WHERE p.created_at < a.created_at AND au.n > 0 AND ae.participant_id IS NOT NULL)::int AS deja_servies
      FROM activity_participants ap
      JOIN participants p ON p.id = ap.participant_id
      JOIN activities   a ON a.id = ap.activity_id
      LEFT JOIN attestations_envoyees ae
             ON ae.activity_id = ap.activity_id AND ae.participant_id = p.id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int n FROM activity_participants x
         WHERE x.participant_id = p.id AND x.activity_id <> $1
      ) au ON TRUE
     WHERE ap.activity_id = $1`, [ACTIVITE]);

  const [acte] = await q("SELECT title, created_at FROM activities WHERE id = $1", [ACTIVITE]);
  console.log(`\n=== Activité ${ACTIVITE} — ${acte ? acte.title : "introuvable"} ===`);
  console.log(`   inscrits aujourd'hui ............ ${ampleur.inscrits}`);
  console.log(`   fiches antérieures à l'activité . ${ampleur.fiches_anterieures}`);
  console.log(`   dont venant d'autres formations . ${ampleur.a_relire}   <<< à relire`);
  console.log(`   dont attestation déjà envoyée ... ${ampleur.deja_servies}   <<< urgent`);

  const suspects = await q(`
    SELECT p.id, p.prenom, p.nom,
           (p.email IS NOT NULL AND trim(p.email) <> '') AS a_un_mail,
           (p.telephone IS NOT NULL AND trim(p.telephone) <> '') AS a_un_tel,
           to_char(p.created_at, 'YYYY-MM-DD') AS fiche_creee_le,
           (ae.participant_id IS NOT NULL) AS attestation_envoyee,
           (SELECT string_agg(DISTINCT COALESCE(d2.name, a2.title), ' | ')
              FROM activity_participants x
              JOIN activities a2 ON a2.id = x.activity_id
              LEFT JOIN devices d2 ON d2.id = a2.device_id
             WHERE x.participant_id = p.id AND x.activity_id <> $1) AS vient_de
      FROM activity_participants ap
      JOIN participants p ON p.id = ap.participant_id
      JOIN activities   a ON a.id = ap.activity_id
      LEFT JOIN attestations_envoyees ae
             ON ae.activity_id = ap.activity_id AND ae.participant_id = p.id
     WHERE ap.activity_id = $1
       AND p.created_at < a.created_at
       AND EXISTS (SELECT 1 FROM activity_participants x
                    WHERE x.participant_id = p.id AND x.activity_id <> $1)
     ORDER BY (ae.participant_id IS NOT NULL) DESC, p.nom
     LIMIT 40`, [ACTIVITE]);

  console.log(`\n=== Les ${suspects.length} premiers à relire ===`);
  for (const s of suspects) {
    console.log(`   #${s.id} ${s.prenom} ${s.nom} — fiche du ${s.fiche_creee_le}` +
      `${s.attestation_envoyee ? "  [ATTESTATION ENVOYÉE]" : ""}`);
    console.log(`        vient de : ${s.vient_de || "—"}`);
  }

  const cas = await q(`
    SELECT p.id, p.prenom, p.nom, to_char(p.created_at,'YYYY-MM-DD') AS creee_le,
           (p.email IS NOT NULL AND trim(p.email) <> '') AS a_un_mail,
           (SELECT string_agg(a.title, ' | ' ORDER BY a.activity_date)
              FROM activity_participants x JOIN activities a ON a.id = x.activity_id
             WHERE x.participant_id = p.id) AS activites
      FROM participants p
     WHERE lower(p.nom) LIKE $1 OR lower(p.prenom) LIKE $1`, [`%${NOM.toLowerCase()}%`]);
  console.log(`\n=== Fiches dont le nom contient « ${NOM} » : ${cas.length} ===`);
  for (const c of cas) {
    console.log(`   #${c.id} ${c.prenom} ${c.nom} — fiche du ${c.creee_le}, mail : ${c.a_un_mail ? "oui" : "non"}`);
    console.log(`        ${c.activites || "aucune activité"}`);
  }

  const [partages] = await q(`
    SELECT COUNT(*)::int AS adresses_sur_plusieurs_fiches FROM (
      SELECT lower(trim(email)) FROM participants
       WHERE email IS NOT NULL AND trim(email) <> ''
       GROUP BY 1 HAVING COUNT(*) > 1) t`);
  console.log(`\n=== Adresses portées par plusieurs fiches : ${partages.adresses_sur_plusieurs_fiches} ===`);

  await pool.end();
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1); });
