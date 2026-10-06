const pool = require("../db");

/**
 * Le cran au-dessus d'administrateur.
 *
 * Le drapeau est relu en base a chaque appel, jamais pris dans le jeton. Le
 * jeton vit huit heures et ne porte que l'identifiant, le role et le
 * partenaire : y glisser « is_super_admin » ferait qu'un acces retire resterait
 * ouvert jusqu'a la deconnexion. Pour une page qui chiffre ce qu'on doit aux
 * partenaires, une requete de plus est un prix derisoire.
 *
 * Le role est verifie en meme temps. Un Admin + est un administrateur qui a
 * quelque chose en plus : si son role est retrograde, le drapeau seul ne doit
 * plus rien ouvrir.
 *
 * La reponse ne distingue pas « je ne sais pas ce que c'est » de « vous n'y
 * avez pas droit » : pour qui n'est pas Admin +, la page budget n'existe pas.
 */
async function requireSuperAdmin(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT role, COALESCE(is_super_admin, false) AS is_super_admin
         FROM users WHERE id = $1 LIMIT 1`,
      [req.user?.id]
    );
    const u = rows[0];
    if (!u || u.role !== "admin" || u.is_super_admin !== true) {
      return res.status(404).json({ error: "Introuvable" });
    }
    next();
  } catch (err) {
    /* La colonne peut manquer si la migration de demarrage a echoue. On refuse
       plutot que de laisser passer : en cas de doute sur un droit, la bonne
       reponse est non. */
    console.error("[ADMIN+] verification impossible :", err.message);
    res.status(404).json({ error: "Introuvable" });
  }
}

module.exports = requireSuperAdmin;
