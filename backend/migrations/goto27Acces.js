const pool = require("../db");

/**
 * Qui, parmi les partenaires, voit GOTO27.
 *
 * GOTO27 s'ouvrait à tous les comptes partenaires sans distinction. Comme pour
 * Mbootay, un administrateur choisit désormais compte par compte.
 *
 * users.is_goto27 a TROIS états, et c'est voulu :
 *
 *  - NULL  : jamais décidé. Un partenaire garde l'accès qu'il avait. C'est
 *            l'état de tous les comptes existants au déploiement : aucun
 *            partenaire ne perd l'accès du jour au lendemain parce qu'une
 *            colonne est apparue.
 *  - TRUE  : accès donné.
 *  - FALSE : accès retiré par un administrateur.
 *
 * Les administrateurs voient GOTO27 d'office ; les coachs et les lecteurs
 * jamais — c'est un espace d'échange avec les partenaires. La règle tient en
 * une fonction, accesGoto27, que le menu et les routes partagent.
 *
 * Idempotente : la rejouer ne coûte rien.
 */
async function ensureGoto27Acces() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_goto27 BOOLEAN`);
}

/* Les migrations de démarrage ne sont pas attendues avant « app.listen ».
   Les écritures passent donc par ici, une fois par processus, et retentent si
   la première tentative a échoué. Les lectures, elles, n'en ont pas besoin :
   elles passent par to_jsonb, qui rend NULL pour une colonne absente. */
let pret = null;
function goto27AccesPret() {
  if (!pret) {
    pret = ensureGoto27Acces().catch((err) => {
      pret = null;
      throw err;
    });
  }
  return pret;
}

/* La règle. « is_goto27 » absent ou NULL : le partenaire garde son accès. */
function accesGoto27(compte) {
  if (!compte) return false;
  if (compte.role === "admin") return true;
  if (compte.role === "partner") return compte.is_goto27 !== false;
  return false;
}

/* Lire le drapeau même si la colonne n'existe pas encore : to_jsonb rend la
   ligne entière, et une clé absente vaut NULL au lieu d'une erreur. */
const LIRE_IS_GOTO27 = "(to_jsonb(u) ->> 'is_goto27')::boolean";

/**
 * Écrire le choix fait sur la fiche utilisateur.
 *
 * Hors partenaire, le drapeau ne veut rien dire : il est remis à NULL, pour
 * qu'un compte repassé partenaire plus tard reparte de la règle par défaut
 * plutôt que d'un choix fait pour un autre rôle.
 *
 * « undefined » ne touche à rien : un écran qui n'envoie pas la case — celui
 * de GOTO27, qui crée des comptes partenaires — ne doit pas en décider.
 */
async function ecrireAccesGoto27(userId, role, valeur) {
  if (role === "partner" && valeur === undefined) return;
  await goto27AccesPret();
  await pool.query("UPDATE users SET is_goto27 = $1 WHERE id = $2", [
    role === "partner" ? Boolean(valeur) : null,
    userId,
  ]);
}

module.exports = {
  ensureGoto27Acces, goto27AccesPret, accesGoto27, ecrireAccesGoto27, LIRE_IS_GOTO27,
};
