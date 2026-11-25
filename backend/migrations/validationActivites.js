const pool = require("../db");

/**
 * Qui a validé une activité, quand, et sur quelle liste.
 *
 * Jusqu'ici, une activité passait « validée » toute seule dès que son score de
 * fiabilité atteignait le seuil. Or ce score mesure le remplissage — une
 * adresse ou un téléphone par fiche, un lieu, une durée — et pas la vérité :
 * une liste aux contacts inventés le franchissait sans peine. Désormais le
 * partenaire déclare et un administrateur ODC valide ; le score reste, comme
 * aide à la décision.
 *
 *  validation_origine
 *    'admin'      : décision d'un administrateur (validée ou rejetée) ;
 *    'odc'        : activité déclarée par un administrateur, validée d'office —
 *                   celui qui déclare est aussi celui qui valide ;
 *    'historique' : validée automatiquement par l'ancien système, avant ce
 *                   changement. Conservée telle quelle, mais signalée ;
 *    'reouverte'  : la liste s'est allongée après la validation — l'activité
 *                   est revenue « à vérifier ».
 *  validation_effectif
 *    le nombre de participants au moment de la décision. Une liste qui grossit
 *    après validation est exactement ce qu'un contrôle doit voir.
 *
 * Idempotente. La reprise des anciennes validations ne se fait qu'une fois,
 * marquée dans app_settings, et dans une transaction avec cette marque.
 */
async function ensureValidationActivites() {
  /* Les colonnes de fiabilité sont créées ailleurs au démarrage, en parallèle :
     on les assure ici aussi pour ne pas dépendre de l'ordre. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS reliability_score NUMERIC(5,2),
      ADD COLUMN IF NOT EXISTS reliability_status TEXT DEFAULT 'a_verifier'
        CHECK (reliability_status IN ('a_verifier','validee','rejetee')),
      ADD COLUMN IF NOT EXISTS reliability_details JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS reliability_manual_override BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS validation_origine TEXT,
      ADD COLUMN IF NOT EXISTS validation_par INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS validation_le TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS validation_effectif INTEGER,
      ADD COLUMN IF NOT EXISTS validation_motif TEXT
  `);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`
      INSERT INTO app_settings (key, value)
      VALUES ('validation_manuelle', jsonb_build_object('depuis', NOW()))
      ON CONFLICT (key) DO NOTHING
    `);
    if (rowCount) {
      /* Les validations automatiques passées restent validées : remettre des
         centaines d'activités anciennes « à vérifier » noierait la file. Elles
         sont marquées, pour qu'on puisse les relire si on le souhaite. */
      await client.query(`
        UPDATE activities a
           SET reliability_manual_override = TRUE,
               validation_origine = 'historique',
               validation_le = NOW(),
               validation_effectif = (SELECT COUNT(*) FROM activity_participants ap
                                       WHERE ap.activity_id = a.id)
         WHERE a.reliability_status = 'validee'
           AND COALESCE(a.reliability_manual_override, FALSE) = FALSE
      `);
      /* Les décisions déjà prises à la main : on photographie l'effectif, pour
         que la réouverture fonctionne aussi pour elles. */
      await client.query(`
        UPDATE activities a
           SET validation_origine = 'admin',
               validation_effectif = (SELECT COUNT(*) FROM activity_participants ap
                                       WHERE ap.activity_id = a.id)
         WHERE a.reliability_manual_override = TRUE
           AND a.validation_origine IS NULL
      `);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* Les migrations de démarrage ne sont pas attendues : le calcul de fiabilité
   passe par ici avant d'écrire, une fois par processus. */
let pret = null;
function validationPrete() {
  if (!pret) {
    pret = ensureValidationActivites().catch((err) => {
      pret = null;
      throw err;
    });
  }
  return pret;
}

module.exports = { ensureValidationActivites, validationPrete };
