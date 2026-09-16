/**
 * Ecarter les adresses injoignables AVANT de les remettre au service d'envoi.
 *
 * Une adresse inventee ou mal recopiee ne coute rien a la plateforme : elle
 * part, rebondit, et c'est tout. Elle coute en revanche tres cher au compte
 * d'expedition. Les services d'envoi surveillent le taux de rebond de chaque
 * client, et un compte neuf qui rebondit des ses premiers envois est suspendu
 * automatiquement — c'est exactement ce qui nous est arrive, deux fois, apres
 * des essais faits avec des adresses fictives.
 *
 * Le controle se fait donc ici, avant l'envoi, et non apres coup : une adresse
 * dont le domaine n'existe pas ne doit jamais etre presentee au fournisseur.
 *
 * Principe directeur : au moindre doute, on laisse passer. Une resolution DNS
 * qui echoue pour une raison passagere ne doit pas faire disparaitre un vrai
 * destinataire. Seul un verdict net — domaine inexistant, domaine qui refuse
 * explicitement le courrier — ecarte une adresse.
 */

const dns = require("dns").promises;

/* RFC 2606 et 6761 reservent ces noms a la documentation et aux essais.
   Aucun ne recoit de courrier, aujourd'hui ni jamais. */
const DOMAINES_RESERVES = new Set([
  "example.com", "example.org", "example.net", "example.edu",
  "test.com", "domain.com", "email.com", "mail.com", "monmail.com",
]);
const SUFFIXES_RESERVES = [".test", ".example", ".invalid", ".localhost", ".local"];

/* Volontairement permissive sur la partie locale : les adresses reelles sont
   plus variees que les expressions rationnelles qu'on leur oppose. Elle ecarte
   ce qui ne peut pas etre une adresse — espace, virgule, chevron, arobase
   manquante, domaine sans point. */
const SYNTAXE =
  /^[^\s@,;:<>()[\]\\"]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const MOTIFS = {
  syntaxe: "l'adresse est mal formée",
  domaine_reserve: "ce domaine est réservé aux exemples et ne reçoit aucun courrier",
  domaine_introuvable: "ce domaine n'existe pas",
  domaine_sans_courrier: "ce domaine refuse explicitement le courrier",
};

/* Les domaines se repetent beaucoup d'un destinataire a l'autre : une liste de
   cent personnes en compte rarement plus d'une dizaine. On ne les interroge
   donc qu'une fois, et le resultat sert plusieurs heures. */
const DUREE_CACHE_MS = 6 * 60 * 60 * 1000;
const cacheDomaines = new Map();

function domaineDe(email) {
  const at = String(email || "").lastIndexOf("@");
  return at === -1 ? "" : String(email).slice(at + 1).trim().toLowerCase();
}

function estReserve(domaine) {
  if (DOMAINES_RESERVES.has(domaine)) return true;
  return SUFFIXES_RESERVES.some((s) => domaine.endsWith(s)) || !domaine.includes(".");
}

/* Une interrogation DNS qui n'aboutit pas doit rendre la main vite : la
   verification precede l'envoi, elle ne doit pas le retarder. */
function avecDelai(promesse, ms) {
  return Promise.race([
    promesse,
    new Promise((_, rejeter) => setTimeout(() => rejeter(Object.assign(new Error("délai dépassé"), { code: "ETIMEOUT" })), ms)),
  ]);
}

/**
 * Le domaine peut-il recevoir du courrier ?
 * Renvoie null quand on n'a pas pu conclure — traite comme « oui », par
 * prudence, mais la distinction sert au rapport.
 */
async function verdictDomaine(domaine, delaiMs = 5000) {
  const enCache = cacheDomaines.get(domaine);
  if (enCache && enCache.expire > Date.now()) return enCache.verdict;

  let verdict = null;
  try {
    const mx = await avecDelai(dns.resolveMx(domaine), delaiMs);
    const utiles = (mx || []).filter((e) => e.exchange && e.exchange !== ".");
    if (utiles.length) verdict = "ok";
    /* MX nul (RFC 7505) : le domaine declare explicitement ne pas recevoir de
       courrier. C'est le cas d'example.com. */
    else if (mx && mx.length) verdict = "domaine_sans_courrier";
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.code === "NXDOMAIN") verdict = "domaine_introuvable";
    else if (err.code !== "ENODATA") verdict = null; // panne, délai : on ne conclut pas
  }

  /* Pas de MX mais le domaine existe : un serveur de courrier peut encore
     ecouter sur son adresse directe. C'est un repli historique, encore en
     usage sur de petits domaines. */
  if (verdict === null || verdict === undefined) {
    for (const resoudre of [dns.resolve4, dns.resolve6]) {
      try {
        const r = await avecDelai(resoudre.call(dns, domaine), delaiMs);
        if (r && r.length) { verdict = "ok"; break; }
      } catch (err) {
        if (err.code === "ENOTFOUND" || err.code === "NXDOMAIN") verdict = "domaine_introuvable";
      }
    }
  }

  cacheDomaines.set(domaine, { verdict, expire: Date.now() + DUREE_CACHE_MS });
  return verdict;
}

/**
 * Trie une liste de destinataires { email, nom }.
 * Renvoie { retenus, rejetes }, chaque rejet portant son motif en clair.
 */
async function trierAdresses(destinataires, { delaiMs = 5000 } = {}) {
  const retenus = [];
  const rejetes = [];
  const aVerifier = [];

  for (const d of destinataires || []) {
    const email = String(d.email || "").trim().toLowerCase();
    if (!SYNTAXE.test(email)) {
      rejetes.push({ ...d, email, motif: "syntaxe", explication: MOTIFS.syntaxe });
      continue;
    }
    const domaine = domaineDe(email);
    if (estReserve(domaine)) {
      rejetes.push({ ...d, email, motif: "domaine_reserve", explication: MOTIFS.domaine_reserve });
      continue;
    }
    aVerifier.push({ ...d, email, domaine });
  }

  const domaines = [...new Set(aVerifier.map((d) => d.domaine))];
  const verdicts = new Map();
  await Promise.all(
    domaines.map(async (dom) => { verdicts.set(dom, await verdictDomaine(dom, delaiMs)); })
  );

  for (const d of aVerifier) {
    const verdict = verdicts.get(d.domaine);
    /* null : on n'a pas pu conclure. On envoie — c'est le seul choix qui ne
       fasse pas disparaitre un destinataire legitime pour une panne DNS. */
    if (verdict === "ok" || verdict === null || verdict === undefined) {
      retenus.push({ email: d.email, nom: d.nom });
    } else {
      rejetes.push({ email: d.email, nom: d.nom, motif: verdict, explication: MOTIFS[verdict] });
    }
  }

  return { retenus, rejetes };
}

module.exports = { trierAdresses, verdictDomaine, MOTIFS };
