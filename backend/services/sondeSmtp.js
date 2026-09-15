const net = require("net");
const dns = require("dns").promises;

/**
 * Sonde de connexion au serveur SMTP, etape par etape.
 *
 * « Connection timeout » ne dit pas ou la connexion s'arrete : le nom est-il
 * resolu, le port est-il ouvert, le serveur repond-il, le compte est-il
 * accepte ? Chaque etape a une correction differente, et la premiere qui
 * echoue rend les suivantes sans objet.
 *
 * L'etape de controle est la plus utile : si le port 443 du meme serveur
 * s'ouvre alors que le port d'envoi reste muet, la machine a bien un acces
 * reseau et c'est le port SMTP qui est ferme — ce que beaucoup d'hebergeurs
 * font par defaut pour limiter les envois abusifs. Aucun reglage de la
 * plateforme n'y changera quoi que ce soit.
 */

const DELAI_MS = 6000;

function ouvrirTcp(hote, port) {
  return new Promise((resoudre) => {
    const debut = Date.now();
    const prise = net.createConnection({ host: hote, port });
    let fini = false;

    const terminer = (resultat) => {
      if (fini) return;
      fini = true;
      prise.destroy();
      resoudre({ ...resultat, duree_ms: Date.now() - debut });
    };

    prise.setTimeout(DELAI_MS);
    prise.on("connect", () => terminer({ ouvert: true }));
    prise.on("timeout", () => terminer({ ouvert: false, erreur: "délai dépassé" }));
    prise.on("error", (e) => terminer({ ouvert: false, erreur: e.code || e.message }));
  });
}

/* On lit la banniere que le serveur envoie de lui-meme apres connexion : une
   prise ouverte qui ne dit rien est le signe d'un mandataire ou d'un pare-feu
   qui accepte la connexion sans la relayer. */
function lireBanniere(hote, port) {
  return new Promise((resoudre) => {
    const prise = net.createConnection({ host: hote, port });
    let fini = false;
    const terminer = (r) => {
      if (fini) return;
      fini = true;
      prise.destroy();
      resoudre(r);
    };
    prise.setTimeout(DELAI_MS);
    prise.on("data", (d) => terminer({ recue: true, texte: String(d).trim().slice(0, 120) }));
    prise.on("timeout", () => terminer({ recue: false, erreur: "aucune réponse du serveur" }));
    prise.on("error", (e) => terminer({ recue: false, erreur: e.code || e.message }));
  });
}

/* Ports de soumission de courrier. On borne volontairement : cette sonde
   ouvre des connexions sortantes vers un hote choisi par l'appelant, et sans
   cette liste elle deviendrait un scanner de ports a usage general. */
const PORTS_AUTORISES = [25, 465, 587, 2525];

/**
 * @param hoteDemande  serveur a tester ; a defaut celui du serveur
 * @param portDemande  port a tester ; a defaut celui du serveur
 *
 * Essayer une configuration demande sinon de changer les variables de
 * l'hebergement et d'attendre un redemarrage a chaque tentative. Quand on
 * cherche lequel de quatre serveurs repond, cela fait quatre redeploiements
 * pour une question a laquelle une connexion TCP repond en six secondes.
 */
async function sonderSmtp(hoteDemande, portDemande) {
  const hote = String(hoteDemande || process.env.SMTP_HOST || "").trim();
  const portBrut = Number(portDemande || process.env.SMTP_PORT || 587);
  const port = PORTS_AUTORISES.includes(portBrut) ? portBrut : 587;
  if (!hote) return null;

  const etapes = [];

  /* 1. Resolution du nom */
  let adresse = null;
  try {
    const r = await dns.lookup(hote);
    adresse = r.address;
    etapes.push({ nom: `Résolution de ${hote}`, ok: true, detail: adresse });
  } catch (e) {
    etapes.push({
      nom: `Résolution de ${hote}`,
      ok: false,
      detail: e.code || e.message,
      remede: "Le nom du serveur est introuvable. Pour Microsoft 365 : smtp.office365.com",
    });
    return { hote, port, etapes };
  }

  /* 2. Ouverture du port d'envoi */
  const tcp = await ouvrirTcp(hote, port);
  etapes.push({
    nom: `Ouverture du port ${port}`,
    ok: tcp.ouvert,
    detail: tcp.ouvert ? `connecté en ${tcp.duree_ms} ms` : `${tcp.erreur} (après ${tcp.duree_ms} ms)`,
    remede: tcp.ouvert ? null : "Le port ne s'ouvre pas depuis ce serveur.",
  });

  /* 3. Controle : le meme hote sur le port HTTPS, toujours autorise.
        C'est lui qui distingue « pas de reseau » de « port SMTP ferme ». */
  if (!tcp.ouvert) {
    const controle = await ouvrirTcp(hote, 443);
    etapes.push({
      nom: "Contrôle : port 443 du même serveur",
      ok: controle.ouvert,
      detail: controle.ouvert
        ? `connecté en ${controle.duree_ms} ms — le serveur a bien un accès réseau`
        : `${controle.erreur} — aucune sortie réseau vers cet hôte`,
      remede: controle.ouvert
        ? `L'accès réseau fonctionne, mais le port ${port} est fermé : c'est l'hébergeur qui bloque le trafic SMTP sortant. Aucun réglage de la plateforme ne le débloquera — il faut un service d'envoi qui passe par HTTPS.`
        : "Le serveur n'a aucune sortie réseau vers cet hôte. Vérifiez la configuration réseau de l'hébergeur.",
    });
    return { hote, port, etapes };
  }

  /* 4. Le serveur se presente-t-il ? */
  const banniere = await lireBanniere(hote, port);
  etapes.push({
    nom: "Réponse du serveur",
    ok: banniere.recue,
    detail: banniere.recue ? banniere.texte : banniere.erreur,
    remede: banniere.recue
      ? null
      : "Le port s'ouvre mais le serveur ne se présente pas : un pare-feu accepte la connexion sans la relayer.",
  });

  return { hote, port, etapes };
}

module.exports = { sonderSmtp, PORTS_AUTORISES };
