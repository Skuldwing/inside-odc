const pool = require("../db");

/**
 * Le budget, et le role qui seul y a acces.
 *
 * Ce que coute une seance n'a pas a etre lu par tout le monde. On ajoute donc
 * un cran au-dessus d'administrateur — « Admin + » — et une page qui n'existe
 * que pour lui.
 *
 * C'est un drapeau sur le compte, pas un nouveau role. La plateforme compte
 * cent dix-huit controles « role === admin » ; introduire une cinquieme valeur
 * aurait oblige a tous les relire, et le moindre oubli aurait retire a un
 * Admin + l'acces a une page ordinaire. Un Admin + est un administrateur qui a
 * quelque chose en plus, jamais quelqu'un d'autre. « is_team_odc » fonctionne
 * deja ainsi.
 *
 * L'amorcage passe par SUPER_ADMIN_EMAILS, variable d'environnement, et
 * seulement quand personne ne porte encore le drapeau. Ensuite, seul un
 * Admin + peut en nommer un autre : si un administrateur ordinaire pouvait se
 * l'accorder, la page ne serait privee que par politesse.
 *
 * Ne lire la variable qu'a vide a deux vertus. Un Admin + retire depuis
 * l'ecran ne ressuscite pas au redemarrage suivant. Et si l'acces est perdu —
 * le dernier Admin + s'est retire par megarde — un redemarrage le retablit a
 * partir de la variable. C'est la porte de secours, et elle ne s'ouvre que
 * quand la maison est vide.
 */
async function ensureBudget() {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE
  `);

  /* Une seule ligne, toujours la meme. Les tarifs d'un centre ne sont pas une
     collection : il n'y en a qu'un jeu a la fois, et c'est le dernier qui
     vaut. La contrainte sur « id » interdit qu'une deuxieme apparaisse, ce qui
     rendrait la page silencieusement fausse selon la ligne lue. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_parametres (
      id               INTEGER PRIMARY KEY DEFAULT 1,
      mode_paiement    TEXT NOT NULL DEFAULT 'beneficiaire',
      tarif_dakar      NUMERIC(14,2) NOT NULL DEFAULT 0,
      tarif_region     NUMERIC(14,2) NOT NULL DEFAULT 0,
      tarif_ligne      NUMERIC(14,2) NOT NULL DEFAULT 0,
      devise           TEXT NOT NULL DEFAULT 'FCFA',
      modifie_le       TIMESTAMPTZ,
      modifie_par      INTEGER,
      modifie_par_nom  TEXT,
      CONSTRAINT budget_parametres_ligne_unique CHECK (id = 1),
      CONSTRAINT budget_parametres_mode
        CHECK (mode_paiement IN ('beneficiaire', 'heure')),
      CONSTRAINT budget_parametres_tarifs_positifs
        CHECK (tarif_dakar >= 0 AND tarif_region >= 0 AND tarif_ligne >= 0)
    )
  `);

  /* Des tarifs a zero plutot qu'aucune ligne : la page s'ouvre et se lit des
     le premier jour, avec des totaux nuls et une invitation a les renseigner.
     Une page qui tombe en panne tant qu'on n'a rien saisi se lit comme un
     bug. */
  await pool.query(
    "INSERT INTO budget_parametres (id) VALUES (1) ON CONFLICT (id) DO NOTHING"
  );

  return amorcerAdminPlus();
}

/* Les premiers Admin +, quand il n'y en a aucun. */
async function amorcerAdminPlus() {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE is_super_admin = TRUE"
  );
  if (rows[0].n > 0) return { amorces: 0, deja: rows[0].n };

  const adresses = String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  if (!adresses.length) return { amorces: 0, deja: 0 };

  /* Le role n'est pas touche : on eleve un administrateur existant, on n'en
     fabrique pas un. Nommer dans la variable quelqu'un qui n'est pas
     administrateur ne fait donc rien, et c'est voulu. */
  const { rowCount } = await pool.query(
    `UPDATE users SET is_super_admin = TRUE
      WHERE LOWER(email) = ANY($1::text[]) AND role = 'admin'`,
    [adresses]
  );
  return { amorces: rowCount, deja: 0, demandes: adresses.length };
}

module.exports = { ensureBudget };
