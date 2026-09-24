const pool = require("../db");

/**
 * L'identite d'une personne, separee de la ligne qui la designe.
 *
 * Jusqu'ici la plateforme n'avait qu'une table : `participants`, ou chaque
 * ligne de liste de presence donne une fiche. Deux listes, deux fiches, meme
 * personne — et le nombre de beneficiaires d'une activite, qui compte des
 * fiches, en annonce deux.
 *
 * Pour corriger, il fallait supprimer : la fiche en trop, ou son inscription.
 * C'est ce qui s'est passe. Une ancienne version supprimait la fiche absorbee
 * et les comptes ont baisse ; on l'a remplacee par un simple remplissage des
 * cases vides, mais le compte restait faux. Un retrait d'inscription a alors
 * ete ajoute — 929 inscriptions retirees en une fois, dont plus de la moitie
 * sur le seul nom, donc au risque de confondre deux homonymes. Chaque
 * correction en appelait une autre parce qu'aucune ne s'attaquait a la cause :
 * l'identite n'existait nulle part, elle etait rededuite a chaque affichage.
 *
 * On la fait donc exister.
 *
 *   personnes     l'identite. Rien d'autre qu'un identifiant stable.
 *   participants  la ligne telle qu'elle a ete ecrite sur la liste,
 *                 rattachee a une personne.
 *
 * Trois consequences.
 *
 * Une ligne de liste de presence n'a plus jamais a etre supprimee. C'est un
 * document : on ne reecrit pas une feuille d'emargement signee.
 *
 * Reunir deux fiches devient un deplacement de rattachement. Reversible, sans
 * perte, sans suppression en cascade.
 *
 * « Beneficiaires » peut enfin vouloir dire personnes distinctes, et non
 * lignes. Le chiffre baisse quand on corrige une identite — ce qui est juste —
 * et ne bouge plus jamais par accident.
 *
 * La migration est neutre : chaque fiche existante recoit sa propre identite.
 * Aucun compte ne change le jour ou elle passe. C'est seulement a partir de la
 * qu'on peut reunir, en le voyant, et le defaire.
 */
async function ensureIdentitePersonnes() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS personnes (
      id       SERIAL PRIMARY KEY,
      creee_le TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE participants
    ADD COLUMN IF NOT EXISTS personne_id INTEGER REFERENCES personnes(id)
  `);

  /* Chaque fiche sans identite en recoit une, a elle. On ne devine aucun
     rapprochement ici : la migration ne doit rien changer aux comptes, sinon
     personne ne pourrait dire ce qu'elle a fait. Les rapprochements se font
     ensuite, un par un, et se defont. */
  const { rowCount } = await pool.query(`
    WITH orphelines AS (
      SELECT id FROM participants WHERE personne_id IS NULL ORDER BY id
    ), creees AS (
      INSERT INTO personnes (id)
      SELECT nextval('personnes_id_seq') FROM orphelines
      RETURNING id
    ), appariees AS (
      SELECT o.id AS fiche, c.id AS personne
        FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM orphelines) o
        JOIN (SELECT id, row_number() OVER (ORDER BY id) AS n FROM creees) c
          ON c.n = o.n
    )
    UPDATE participants p
       SET personne_id = a.personne
      FROM appariees a
     WHERE p.id = a.fiche
  `);

  /* L'index porte les deux lectures : « qui est cette personne » et « combien
     de personnes distinctes sur cette activite ». */
  await pool.query(
    "CREATE INDEX IF NOT EXISTS participants_personne_idx ON participants (personne_id)"
  );

  /* Toute fiche naît avec une identite, quel que soit le chemin qui la cree.
     Quatre endroits inserent des fiches aujourd'hui — l'import par lot,
     l'import direct, l'emargement public, la remise en place d'une fiche — et
     rien n'empeche qu'il y en ait un cinquieme demain. Un invariant que
     quatre appelants doivent penser a respecter finit par etre oublie, et
     c'est exactement la famille de bugs qu'on est en train de corriger. La
     base le tient donc elle-meme.

     Le declencheur ne s'applique qu'a l'absence d'identite : une fiche
     inseree avec un personne_id — une remise en place, par exemple — garde
     celui qu'on lui donne. */
  await pool.query(`
    CREATE OR REPLACE FUNCTION participants_donner_identite() RETURNS trigger AS $fn$
    BEGIN
      IF NEW.personne_id IS NULL THEN
        INSERT INTO personnes DEFAULT VALUES RETURNING id INTO NEW.personne_id;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
  `);
  await pool.query("DROP TRIGGER IF EXISTS participants_identite ON participants");
  await pool.query(`
    CREATE TRIGGER participants_identite
    BEFORE INSERT ON participants
    FOR EACH ROW EXECUTE FUNCTION participants_donner_identite()
  `);

  return { fichesRattachees: rowCount };
}

module.exports = { ensureIdentitePersonnes };
