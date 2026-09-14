const crypto = require("crypto");
const pool = require("../db");

/**
 * Desabonnement.
 *
 * Gmail et Yahoo exigent depuis fevrier 2024 que tout envoi en nombre porte
 * un lien de desabonnement fonctionnel en un seul clic — en-tetes
 * List-Unsubscribe et List-Unsubscribe-Post. Un lien qui demande de se
 * connecter, ou qui ouvre un formulaire a remplir, ne satisfait pas
 * l'exigence : le clic doit suffire.
 *
 * Le jeton est calcule, non stocke : il porte l'adresse et une signature qui
 * prouve qu'il vient de nous. Aucune ligne n'est ecrite en base tant que
 * personne ne s'est desabonne, et un lien reste valable indefiniment — un
 * message retrouve dans une boite six mois plus tard doit encore permettre de
 * se retirer.
 */

/* On derive une cle dediee plutot que d'employer JWT_SECRET directement :
   ainsi un jeton de desabonnement ne peut rien signer d'autre. */
function cle() {
  const base = process.env.JWT_SECRET || "";
  if (!base) return null;
  return crypto.createHmac("sha256", base).update("desabonnement-v1").digest();
}

const enB64url = (v) => Buffer.from(v, "utf8").toString("base64url");
const deB64url = (v) => Buffer.from(String(v), "base64url").toString("utf8");

function normaliser(email) {
  return String(email || "").trim().toLowerCase();
}

function jetonPour(email) {
  const k = cle();
  const adresse = normaliser(email);
  if (!k || !adresse) return null;
  const corps = enB64url(adresse);
  const signature = crypto.createHmac("sha256", k).update(corps).digest("base64url").slice(0, 32);
  return `${corps}.${signature}`;
}

/* Renvoie l'adresse si le jeton est authentique, null sinon. La comparaison
   passe par timingSafeEqual : une comparaison de chaines ordinaire laisse
   deviner la signature octet par octet. */
function emailDuJeton(jeton) {
  const k = cle();
  if (!k) return null;
  const [corps, signature] = String(jeton || "").split(".");
  if (!corps || !signature) return null;

  const attendue = crypto.createHmac("sha256", k).update(corps).digest("base64url").slice(0, 32);
  const a = Buffer.from(signature);
  const b = Buffer.from(attendue);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const email = deB64url(corps);
    return email.includes("@") ? email : null;
  } catch {
    return null;
  }
}

function lienDesabonnement(baseUrl, email) {
  const jeton = jetonPour(email);
  if (!jeton || !baseUrl) return null;
  return `${String(baseUrl).replace(/\/+$/, "")}/desabonnement/${jeton}`;
}

/* Les deux en-tetes vont ensemble : le premier donne l'adresse a appeler, le
   second dit qu'un simple POST suffit. Sans le second, Gmail n'affiche pas le
   bouton « Se desabonner » a cote de l'expediteur. */
function entetesDesabonnement(baseUrl, email) {
  const lien = lienDesabonnement(baseUrl, email);
  if (!lien) return {};
  return {
    "List-Unsubscribe": `<${lien}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

async function desabonner(email, { motif = null, origine = null } = {}) {
  const adresse = normaliser(email);
  if (!adresse) return false;
  await pool.query(
    `INSERT INTO email_optout (email, motif, origine)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET motif = COALESCE(EXCLUDED.motif, email_optout.motif)`,
    [adresse, motif, origine]
  );
  return true;
}

async function reabonner(email) {
  await pool.query(`DELETE FROM email_optout WHERE email = $1`, [normaliser(email)]);
}

async function estDesabonne(email) {
  const r = await pool.query(`SELECT 1 FROM email_optout WHERE email = $1`, [normaliser(email)]);
  return r.rowCount > 0;
}

/* Filtre une liste de destinataires en une seule requete : un SELECT par
   adresse sur une campagne de plusieurs centaines de personnes ferait autant
   d'allers-retours que de destinataires. */
async function separerDesabonnes(destinataires) {
  if (!destinataires.length) return { retenus: [], desabonnes: [] };
  const adresses = destinataires.map((d) => normaliser(d.email));
  const r = await pool.query(`SELECT email FROM email_optout WHERE email = ANY($1::text[])`, [adresses]);
  const exclus = new Set(r.rows.map((x) => x.email));
  return {
    retenus: destinataires.filter((d) => !exclus.has(normaliser(d.email))),
    desabonnes: destinataires.filter((d) => exclus.has(normaliser(d.email))),
  };
}

module.exports = {
  jetonPour,
  emailDuJeton,
  lienDesabonnement,
  entetesDesabonnement,
  desabonner,
  reabonner,
  estDesabonne,
  separerDesabonnes,
  normaliser,
};
