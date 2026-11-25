const pool = require("../db");

/**
 * Qui voit GOTO27.
 *
 * GOTO27 s'ouvrait à tous les comptes partenaires sans distinction. Comme pour
 * Mbootay, un administrateur choisit désormais compte par compte — pour les
 * partenaires, et pour les coachs (formateurs).
 *
 * users.is_goto27 a TROIS états, et c'est voulu :
 *
 *  - NULL  : jamais décidé. Un partenaire garde l'accès qu'il avait — aucun
 *            ne le perd parce qu'une colonne est apparue. Un coach, lui, n'y
 *            avait jamais eu accès : NULL le laisse dehors.
 *  - TRUE  : accès donné.
 *  - FALSE : accès retiré par un administrateur.
 *
 * GOTO27 est l'espace d'un partenaire. Un coach y entre par le partenaire
 * auquel il est rattaché, avec les mêmes droits qu'un compte partenaire : sans
 * partenaire, il n'a pas d'espace où entrer. Les administrateurs voient
 * GOTO27 d'office, les lecteurs jamais. La règle tient en une fonction,
 * accesGoto27, que le menu et les routes partagent.
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

/* Les rôles pour qui la case existe. */
const ROLES_GOTO27 = ["partner", "coach"];

/* La règle. « is_goto27 » absent ou NULL : le partenaire garde son accès, le
   coach reste dehors. */
function accesGoto27(compte) {
  if (!compte) return false;
  if (compte.role === "admin") return true;
  if (compte.role === "partner") return compte.is_goto27 !== false;
  if (compte.role === "coach") {
    return compte.is_goto27 === true && Number.isInteger(Number(compte.partner_id)) && Number(compte.partner_id) > 0;
  }
  return false;
}

/* Lire le drapeau même si la colonne n'existe pas encore : to_jsonb rend la
   ligne entière, et une clé absente vaut NULL au lieu d'une erreur. */
const LIRE_IS_GOTO27 = "(to_jsonb(u) ->> 'is_goto27')::boolean";

/**
 * Écrire le choix fait sur la fiche utilisateur.
 *
 * Hors partenaire et coach, le drapeau ne veut rien dire : il est remis à
 * NULL, pour qu'un compte qui change de rôle plus tard reparte de la règle par
 * défaut plutôt que d'un choix fait pour un autre rôle.
 *
 * « undefined » ne touche à rien : un écran qui n'envoie pas la case — celui
 * de GOTO27, qui crée des comptes partenaires — ne doit pas en décider.
 */
async function ecrireAccesGoto27(userId, role, valeur) {
  const concerne = ROLES_GOTO27.includes(role);
  if (concerne && valeur === undefined) return;
  await goto27AccesPret();
  await pool.query("UPDATE users SET is_goto27 = $1 WHERE id = $2", [
    concerne ? Boolean(valeur) : null,
    userId,
  ]);
}

module.exports = {
  ensureGoto27Acces, goto27AccesPret, accesGoto27, ecrireAccesGoto27, LIRE_IS_GOTO27, ROLES_GOTO27,
};
