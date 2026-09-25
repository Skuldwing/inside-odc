const pool = require("../db");

/**
 * La liste telle qu'elle a ete ecrite, et le doute consigne.
 *
 * L'import decide seul si deux lignes designent la meme personne. Il a
 * longtemps decide sur le nom seul, et 170 personnes d'une liste de 1825 ont
 * disparu sans que personne ne puisse dire lesquelles. La regle est
 * corrigee ; le probleme de fond ne l'est pas : une machine ne peut pas
 * savoir si deux « Aissatou Diallo » sont une ou deux.
 *
 * On ouvre donc la porte de sortie. Le responsable qui connait sa liste peut
 * demander qu'elle entre telle quelle : une ligne, une inscription, aucun
 * rapprochement. Ce que l'import aurait reuni n'est pas perdu pour autant —
 * c'est consigne, et un administrateur le tranche apres coup, en connaissance
 * de cause.
 *
 * Deux choses a garder, donc.
 *
 * Sur l'activite : qu'elle a ete importee telle quelle, et si quelqu'un l'a
 * validee depuis. Tant que non, elle porte un badge — un effectif sous
 * reserve doit se voir, sinon il finit dans un rapport comme s'il etait sur.
 *
 * A cote : les rapprochements que l'import a vus et n'a pas faits. Deux
 * fiches, le motif, et de quoi decider sans rouvrir le fichier Excel.
 */
async function ensureListeTelleQuelle() {
  /* Sur l'activite. « liste_telle_quelle » dit comment elle est entree ;
     « liste_validee_le » dit si quelqu'un l'a regardee depuis. Les deux sont
     necessaires : une liste validee reste une liste entree telle quelle, et
     on doit pouvoir le lire six mois plus tard. */
  await pool.query(`
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS liste_telle_quelle    BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS liste_validee_le      TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS liste_validee_par     INTEGER,
      ADD COLUMN IF NOT EXISTS liste_validee_par_nom TEXT
  `);

  /* Le diagnostic, conserve.
   *
   * On y recopie le nom, le contact et le motif plutot que de les relire dans
   * « participants » : la fiche peut changer entre l'import et la revue, et
   * ce qu'on veut montrer a l'administrateur, c'est ce que le fichier disait
   * au moment ou la question s'est posee. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rapprochements_ecartes (
      id            SERIAL PRIMARY KEY,
      activity_id   INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      fiche_id      INTEGER REFERENCES participants(id) ON DELETE CASCADE,
      avec_fiche_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
      motif         TEXT NOT NULL,
      nom           TEXT,
      prenom        TEXT,
      email         TEXT,
      telephone     TEXT,
      avec          TEXT,
      tranche       TEXT,
      ecarte_le     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      /* Tranche : « reuni » quand un administrateur a dit que c'etait la meme
         personne, « distinct » quand il a dit que non. NULL tant qu'il n'a
         rien dit. */
      CONSTRAINT rapprochements_ecartes_tranche
        CHECK (tranche IS NULL OR tranche IN ('reuni', 'distinct'))
    )
  `);

  await pool.query(
    "CREATE INDEX IF NOT EXISTS rapprochements_ecartes_activite_idx ON rapprochements_ecartes (activity_id)"
  );
  /* Ce qui attend une decision, toutes activites confondues : c'est la file
     de travail de l'administrateur. */
  await pool.query(
    `CREATE INDEX IF NOT EXISTS rapprochements_ecartes_attente_idx
       ON rapprochements_ecartes (activity_id) WHERE tranche IS NULL`
  );
}

module.exports = { ensureListeTelleQuelle };
