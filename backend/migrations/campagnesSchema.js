const pool = require("../db");

/**
 * Schema des campagnes emailing.
 *
 * Deux manques rendaient les envois ingerables :
 *
 *   1. Aucune trace par destinataire. La campagne ne retenait que deux
 *      compteurs, « envoyes » et « echoues ». Quand un benificiaire disait
 *      n'avoir rien recu, rien ne permettait de savoir si le message etait
 *      parti, ni pourquoi il avait echoue.
 *
 *   2. Aucun moyen de se desabonner. Gmail et Yahoo l'exigent depuis fevrier
 *      2024 pour tout expediteur en nombre, et c'est de toute facon la seule
 *      reponse acceptable a quelqu'un qui demande a ne plus etre sollicite.
 *
 * Comme toutes les migrations de demarrage, celle-ci est idempotente et peut
 * etre rejouee par les routes si elle a echoue au demarrage.
 */
async function ensureCampagnesSchema() {
  await pool.query(`
    ALTER TABLE campagnes
      ADD COLUMN IF NOT EXISTS total_count  INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS finished_at  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_error   TEXT
  `);

  /* Une ligne par destinataire et par campagne. La contrainte d'unicite est
     ce qui rend un envoi reprenable : relancer une campagne interrompue ne
     peut pas produire un second message pour quelqu'un qui l'a deja recu. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campagne_envois (
      id          SERIAL PRIMARY KEY,
      campagne_id INTEGER NOT NULL REFERENCES campagnes(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      nom         TEXT,
      statut      TEXT NOT NULL DEFAULT 'en_attente',
      erreur      TEXT,
      traite_le   TIMESTAMPTZ,
      cree_le     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (campagne_id, email)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_campagne_envois_campagne ON campagne_envois (campagne_id, statut)`
  );

  /* Liste d'opposition. Volontairement independante de participants : une
     adresse peut se desabonner sans etre inscrite nulle part, et un
     participant supprime puis reimporte ne doit pas se retrouver reabonne. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_optout (
      email     TEXT PRIMARY KEY,
      motif     TEXT,
      origine   TEXT,
      cree_le   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  /* Le mode « Cc » exposait l'adresse de chaque destinataire a tous les
     autres — y compris celles d'enfants sur les activites Kids Tech. Il est
     retire du produit ; les campagnes qui le portaient encore basculent en
     publipostage, qui envoie un message par personne. */
  await pool.query(`UPDATE campagnes SET send_mode = 'publipostage' WHERE send_mode = 'cc'`);
}

/* 42703 : colonne inconnue. 42P01 : table inconnue. Les deux seules erreurs
   qu'une migration non jouee peut produire ici. */
function estSchemaManquant(err) {
  return err && (err.code === "42703" || err.code === "42P01");
}

module.exports = { ensureCampagnesSchema, estSchemaManquant };
