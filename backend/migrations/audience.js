const pool = require("../db");

/**
 * Mesurer l'audience sans fabriquer de dossier sur personne.
 *
 * Deux perimetres seulement : la page d'accueil publique et l'espace des
 * beneficiaires. La plateforme interne n'est pas mesuree — savoir combien de
 * minutes un coach passe sur un ecran serait de la surveillance de
 * collaborateur, et ce n'est pas ce qu'on cherche.
 *
 *
 * CE QU'ON NE STOCKE PAS
 *
 * Aucun identifiant de visiteur. Aucune adresse IP. Aucun agent utilisateur.
 * Aucune empreinte de navigateur. Le navigateur tire un numero au hasard a
 * l'ouverture d'un onglet, le garde le temps de cet onglet, et il meurt avec
 * lui : c'est le numero d'une visite, pas celui d'une personne. Deux visites du
 * meme visiteur sont donc deux lignes sans lien entre elles, et c'est voulu.
 *
 * « Visiteurs du jour » se compte sans identifiant : le navigateur retient la
 * date de son dernier passage — une date, rien d'autre — et annonce « c'est ma
 * premiere visite aujourd'hui ». Le serveur additionne ces declarations. On
 * obtient le compte des visiteurs uniques du jour sans que rien, nulle part,
 * ne permette de relier deux de leurs visites.
 *
 *
 * TROIS TABLES, ET POURQUOI PAS UNE
 *
 * Le stockage Neon est facture au gigaoctet-mois. Une table d'evenements bruts
 * — une ligne par page vue, par clic, par battement de coeur — est ce qui
 * grossit le plus vite dans une plateforme de cette taille, et c'est aussi la
 * plus inutile : personne ne relit un evenement vieux de six mois, on relit des
 * totaux. On stocke donc des totaux.
 *
 *   audience_visites    une ligne par visite, mise a jour sur place, gardee
 *                       quatre-vingt-dix jours. C'est le detail recent : duree,
 *                       provenance, appareil.
 *
 *   audience_jours      un compteur par jour et par perimetre, garde pour
 *                       toujours. Deux lignes par jour, sept cent trente par
 *                       an : l'historique long ne coute rien.
 *
 *   audience_evenements un compteur par jour, perimetre, evenement et valeur.
 *                       Les valeurs viennent d'une liste fermee cote serveur,
 *                       sauf la provenance ; la cardinalite est donc bornee et
 *                       la table ne peut pas enfler.
 *
 * Les jours recents se lisent dans audience_visites, les anciens dans
 * audience_jours. Une seule source par periode : jamais deux chiffres a
 * reconcilier.
 */

/* Au-dela, le detail d'une visite n'apprend plus rien que le compteur
   journalier ne dise mieux. */
const RETENTION_JOURS = 90;

/* Les deux perimetres mesures. La liste est fermee : un perimetre inconnu est
   refuse a l'ecriture plutot que de creer une categorie fantome que personne
   ne saurait interpreter. */
const ESPACES = ["accueil", "espace"];

async function ensureAudience() {
  /* La cle est tiree par le navigateur. Elle est donc devinable, et quelqu'un
     pourrait gonfler la duree d'une visite qui n'est pas la sienne — sans
     jamais rien y lire, puisqu'il n'y a rien a y lire. Les bornes CHECK
     plafonnent les degats : une visite ne peut pas depasser vingt-quatre
     heures ni mille pages. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audience_visites (
      cle              TEXT PRIMARY KEY,
      espace           TEXT        NOT NULL,
      debut            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      fin              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      secondes         INTEGER     NOT NULL DEFAULT 0,
      vues             INTEGER     NOT NULL DEFAULT 1,
      premiere_du_jour BOOLEAN     NOT NULL DEFAULT FALSE,
      nouveau          BOOLEAN     NOT NULL DEFAULT FALSE,
      source           TEXT,
      appareil         TEXT,
      CONSTRAINT audience_visites_espace
        CHECK (espace IN ('accueil', 'espace')),
      CONSTRAINT audience_visites_secondes
        CHECK (secondes >= 0 AND secondes <= 86400),
      CONSTRAINT audience_visites_vues
        CHECK (vues >= 0 AND vues <= 1000),
      CONSTRAINT audience_visites_appareil
        CHECK (appareil IS NULL OR appareil IN ('mobile', 'tablette', 'ordinateur'))
    )
  `);

  /* « debut » porte l'index parce que c'est la colonne de toutes les lectures :
     la synthese demande une periode, et l'entretien demande ce qui est
     perime. */
  await pool.query(
    "CREATE INDEX IF NOT EXISTS audience_visites_debut_idx ON audience_visites (debut)"
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audience_jours (
      jour      DATE    NOT NULL,
      espace    TEXT    NOT NULL,
      visites   INTEGER NOT NULL DEFAULT 0,
      visiteurs INTEGER NOT NULL DEFAULT 0,
      nouveaux  INTEGER NOT NULL DEFAULT 0,
      vues      INTEGER NOT NULL DEFAULT 0,
      secondes  BIGINT  NOT NULL DEFAULT 0,
      eclairs   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (jour, espace),
      CONSTRAINT audience_jours_espace CHECK (espace IN ('accueil', 'espace'))
    )
  `);

  /* « valeur » n'est jamais NULL mais souvent vide : un evenement comme
     « session ouverte » se compte sans qualificatif. Une chaine vide plutot
     que NULL pour que la cle primaire fonctionne — NULL n'est egal a rien,
     pas meme a lui-meme, et chaque ecriture aurait cree une ligne de plus. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audience_evenements (
      jour      DATE    NOT NULL,
      espace    TEXT    NOT NULL,
      evenement TEXT    NOT NULL,
      valeur    TEXT    NOT NULL DEFAULT '',
      nombre    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (jour, espace, evenement, valeur),
      CONSTRAINT audience_evenements_espace CHECK (espace IN ('accueil', 'espace'))
    )
  `);

  return { retention: RETENTION_JOURS };
}

/* ===== L'ENTRETIEN =====
 *
 * Deux gestes : resumer les journees finies, puis oublier leur detail.
 *
 * Le resume est recalcule a chaque passage pour toutes les journees encore
 * detaillees, et non seulement pour celles qui vont disparaitre. C'est
 * volontairement redondant : un passage manque — redemarrage, panne — ne laisse
 * alors aucun trou, et le total d'une journee corrige lui-meme un resume
 * ecrit trop tot. Quatre-vingt-dix journees fois deux perimetres, c'est cent
 * quatre-vingts lignes : le calcul se paie en millisecondes.
 *
 * La journee en cours n'est jamais resumee. Elle n'est pas finie, et la
 * synthese la lit de toute facon dans le detail.
 */
async function entretenirAudience() {
  const resume = await pool.query(
    `INSERT INTO audience_jours
         (jour, espace, visites, visiteurs, nouveaux, vues, secondes, eclairs)
     SELECT (debut AT TIME ZONE 'UTC')::date       AS jour,
            espace,
            COUNT(*)::int                          AS visites,
            COUNT(*) FILTER (WHERE premiere_du_jour)::int AS visiteurs,
            COUNT(*) FILTER (WHERE nouveau)::int    AS nouveaux,
            SUM(vues)::int                          AS vues,
            SUM(secondes)::bigint                   AS secondes,
            COUNT(*) FILTER (WHERE secondes < 10)::int AS eclairs
       FROM audience_visites
      WHERE (debut AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date
      GROUP BY 1, 2
     ON CONFLICT (jour, espace) DO UPDATE
        SET visites   = EXCLUDED.visites,
            visiteurs = EXCLUDED.visiteurs,
            nouveaux  = EXCLUDED.nouveaux,
            vues      = EXCLUDED.vues,
            secondes  = EXCLUDED.secondes,
            eclairs   = EXCLUDED.eclairs`
  );

  const purge = await pool.query(
    `DELETE FROM audience_visites
      WHERE debut < NOW() - ($1 || ' days')::interval`,
    [RETENTION_JOURS]
  );

  return { journees: resume.rowCount, visitesOubliees: purge.rowCount };
}

module.exports = { ensureAudience, entretenirAudience, RETENTION_JOURS, ESPACES };
