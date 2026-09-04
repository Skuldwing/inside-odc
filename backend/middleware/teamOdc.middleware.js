const pool = require("../db");

/* Accès Mbootay : admins, ou utilisateurs marqués "team ODC".
   Le drapeau est relu en base à chaque requête pour qu'un retrait
   d'accès prenne effet immédiatement, sans attendre une reconnexion. */
module.exports = async function requireTeamOdc(req, res, next) {
  try {
    if (req.user?.role === "admin") return next();

    const result = await pool.query(
      "SELECT COALESCE(is_team_odc, false) AS is_team_odc FROM users WHERE id = $1",
      [req.user.id]
    );
    if (result.rows[0]?.is_team_odc) return next();

    return res.status(403).json({ error: "Acces refuse (Mbootay)" });
  } catch (err) {
    console.error("[TEAM ODC]", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
};
