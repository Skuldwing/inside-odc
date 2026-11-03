const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const pool = require("../db");

/**
 * Les jetons de l'espace beneficiaire.
 *
 * LE POINT A NE PAS MANQUER : DEUX MONDES, DEUX CLES
 *
 * La plateforme signe deja des jetons de session pour ses utilisateurs —
 * administrateurs, partenaires, coachs — avec JWT_SECRET. Signer ceux des
 * beneficiaires avec la meme cle serait une faute : il suffirait qu'un jeton
 * de beneficiaire porte un champ « id » pour que « authMiddleware » le
 * verifie sans broncher et l'accepte comme un compte, avec le role qu'il y
 * trouverait. Une adresse connue d'une liste de presence ouvrirait
 * l'administration.
 *
 * La cle utilisee ici est donc derivee de JWT_SECRET, mais distincte : un
 * jeton signe d'un cote ne peut pas etre verifie de l'autre. Aucune variable
 * d'environnement de plus a poser, et la confusion devient impossible plutot
 * qu'improbable. Le cookie porte aussi un autre nom, pour la meme raison.
 */
const CLE_ESPACE = crypto
  .createHmac("sha256", String(process.env.JWT_SECRET || ""))
  .update("espace-beneficiaire-v1")
  .digest("hex");

const COOKIE = "espace_token";

/* Le lien ouvre un dossier personnel : il vit moins longtemps qu'un lien de
   mot de passe, qui ne fait qu'amener a un formulaire. Assez pour relever sa
   boite sans se presser, trop peu pour trainer dans un historique. */
const DUREE_LIEN_MINUTES = 60;

/* La session, une fois le lien consomme. Assez courte pour qu'un ordinateur
   partage — un telecentre, un cybercafe — ne garde pas l'acces ouvert. */
const DUREE_SESSION_HEURES = 4;

/* Combien de liens une meme adresse peut demander d'affilee. Sans cette
   borne, le formulaire devient un moyen d'inonder la boite de n'importe qui
   dont on connait l'adresse. */
const LIENS_MAX = 3;
const FENETRE_MINUTES = 15;

function empreinte(jeton) {
  return crypto.createHash("sha256").update(String(jeton)).digest("hex");
}

function normaliser(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Cree un lien pour cette adresse, ou refuse si elle en a trop demande.
 * @returns {Promise<string|null>} le jeton en clair, ou null si la limite est
 *          atteinte. L'appelant ne doit pas distinguer les deux cas pour le
 *          visiteur : voir la route.
 */
async function creerLien(email, ip) {
  const adresse = normaliser(email);

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM espace_liens
      WHERE email = $1 AND cree_le > NOW() - ($2 || ' minutes')::interval`,
    [adresse, String(FENETRE_MINUTES)]
  );
  if (rows[0].n >= LIENS_MAX) return null;

  const jeton = crypto.randomBytes(32).toString("hex");

  /* Un lien plus ancien devient caduc des qu'on en demande un nouveau : c'est
     ce qu'attend quelqu'un qui reclique « envoyez-moi un lien » parce que le
     premier n'arrivait pas. */
  await pool.query(
    "UPDATE espace_liens SET utilise_le = NOW() WHERE email = $1 AND utilise_le IS NULL",
    [adresse]
  );

  await pool.query(
    `INSERT INTO espace_liens (email, jeton_hash, expire_le, ip)
     VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval, $4)`,
    [adresse, empreinte(jeton), String(DUREE_LIEN_MINUTES), ip || null]
  );

  return jeton;
}

/**
 * Consomme un jeton presente. Usage unique : un lien qui traine dans un
 * historique ou transfere par erreur n'ouvre rien une seconde fois.
 * @returns {Promise<string|null>} l'adresse, ou null si le jeton ne vaut rien.
 */
async function consommerLien(jeton) {
  if (!jeton) return null;
  const { rows } = await pool.query(
    `UPDATE espace_liens SET utilise_le = NOW()
      WHERE jeton_hash = $1 AND utilise_le IS NULL AND expire_le > NOW()
      RETURNING email`,
    [empreinte(jeton)]
  );
  return rows[0]?.email || null;
}

function signerSession(email) {
  return jwt.sign(
    { email: normaliser(email), espace: true },
    CLE_ESPACE,
    { expiresIn: `${DUREE_SESSION_HEURES}h` }
  );
}

function lireSession(req) {
  const entete = req.headers.cookie || "";
  const part = entete
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE}=`));
  if (!part) return null;
  try {
    const charge = jwt.verify(decodeURIComponent(part.slice(COOKIE.length + 1)), CLE_ESPACE);
    /* Ceinture et bretelles : meme avec la bonne cle, on exige la marque. */
    return charge?.espace === true && charge.email ? charge.email : null;
  } catch {
    return null;
  }
}

function optionsCookie() {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: prod,
    sameSite: process.env.JWT_COOKIE_SAMESITE || (prod ? "none" : "lax"),
    path: "/",
    maxAge: DUREE_SESSION_HEURES * 60 * 60 * 1000,
  };
}

/* Le garde des routes de l'espace. Il ne connait que des adresses : aucun
   role, aucun identifiant de compte, rien qui ressemble a une session
   d'administration. */
function exigerEspace(req, res, next) {
  const email = lireSession(req);
  if (!email) return res.status(401).json({ error: "Session expirée" });
  req.espace = { email };
  next();
}

module.exports = {
  COOKIE,
  DUREE_LIEN_MINUTES,
  DUREE_SESSION_HEURES,
  creerLien,
  consommerLien,
  signerSession,
  lireSession,
  optionsCookie,
  exigerEspace,
  normaliser,
};
