const pool = require("../db");

/**
 * Modeles d'attestation.
 *
 * L'attestation etait entierement ecrite dans le code : le bandeau « TECH-KI »,
 * le nom du programme, celui de l'organisation, le signataire. Un dispositif
 * mene avec un partenaire — la Tech Academy avec le COJOJ, dans le cadre des
 * JOJ Dakar 2026 — ne pouvait donc pas faire figurer son logo ni sa mention.
 * Il fallait modifier le code pour chaque partenariat.
 *
 * Un modele rassemble ce qui change d'un dispositif a l'autre : les textes et
 * le logo du partenaire. Ce qui ne change pas — le fond, le cadre, la mise en
 * page, la signature de la direction du centre — reste dans le rendu.
 *
 * Le logo est stocke en base, comme les photos d'activite : le disque de
 * l'hebergement est efface a chaque redeploiement, un fichier n'y survivrait
 * pas. Il n'est jamais renvoye par la liste — seule la route dediee le sert —
 * pour ne pas embarquer des images dans chaque reponse JSON.
 */
async function ensureModelesAttestation() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS modeles_attestation (
      id                   SERIAL PRIMARY KEY,
      nom                  TEXT NOT NULL,
      /* Le bandeau du coin superieur droit, en deux morceaux : le second
         s'ecrit en orange. « TECH- » + « KI ». */
      bandeau_avant        TEXT,
      bandeau_apres        TEXT,
      /* La phrase « organisee dans le cadre du programme X de Y ». */
      programme            TEXT,
      organisation         TEXT,
      /* Une ligne libre sous la phrase : le partenariat, le cadre. */
      mention              TEXT,
      signataire_nom       TEXT,
      signataire_fonction  TEXT,
      logo_partenaire      BYTEA,
      logo_partenaire_type TEXT,
      par_defaut           BOOLEAN NOT NULL DEFAULT FALSE,
      cree_le              TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* Le dessin du document. « tech-ki » est celui d'origine ; « kids-tech »
     est le modele illustre destine aux enfants, sur lequel s'ecrivent les
     attestations de Super Codeur. Les modeles existants gardent le premier :
     changer le dessin d'une attestation deja delivree serait un contresens. */
  await pool.query(
    `ALTER TABLE modeles_attestation
       ADD COLUMN IF NOT EXISTS style TEXT NOT NULL DEFAULT 'tech-ki'`
  );

  /* Un dispositif choisit son modele. A defaut, celui marque par defaut. */
  await pool.query(
    `ALTER TABLE devices
       ADD COLUMN IF NOT EXISTS modele_attestation_id INTEGER
       REFERENCES modeles_attestation(id) ON DELETE SET NULL`
  );

  /* Un seul modele par defaut : l'index le garantit plutot qu'un controle
     applicatif, qui se contournerait a la premiere route oubliee. */
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_modele_attestation_defaut
       ON modeles_attestation ((par_defaut)) WHERE par_defaut`
  );

  /* Le modele Tech-Ki existant, pose tel quel : sans lui, les attestations
     deja envoyees et celles a venir n'auraient plus de reference commune. */
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM modeles_attestation");
  if (rows[0].n === 0) {
    await pool.query(
      `INSERT INTO modeles_attestation
         (nom, bandeau_avant, bandeau_apres, programme, organisation,
          signataire_nom, signataire_fonction, par_defaut)
       VALUES ('Tech-Ki', 'TECH-', 'KI', 'Tech-Ki', 'Orange Digital Center',
               'NAFISSATOU CHÉRIF NIANG', 'Directrice de Orange Digital Center', TRUE)`
    );
  }
}

module.exports = { ensureModelesAttestation };
