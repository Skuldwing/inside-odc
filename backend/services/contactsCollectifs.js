const { clePersonne, nomsCompatibles } = require("./nomsDoublons");

/**
 * Les contacts qui ne designent personne.
 *
 * Toute la plateforme tenait une adresse ou un numero pour une preuve
 * d'identite : deux fiches qui le partagent sont la meme personne, et on les
 * rapprochait sans reserve. C'est vrai d'un telephone personnel. Ce ne l'est
 * pas d'un telephone d'ecole.
 *
 * Les listes de presence des ateliers pour enfants ne demandent pas leur
 * numero — ils n'en ont pas. On y porte celui du directeur d'ecole, ou d'un
 * responsable. Vingt enfants se retrouvent donc avec le meme, et la
 * plateforme en faisait une seule personne : un seul beneficiaire compte pour
 * vingt, une seule attestation pour vingt enfants qui ont suivi l'atelier.
 *
 * Le meme mecanisme vaut pour une adresse de service, celle d'un partenaire,
 * ou l'adresse d'un parent portee par plusieurs enfants.
 *
 * On reconnait ces contacts a ce qu'ils accompagnent plusieurs personnes
 * differentes. « Differentes » demande de la prudence : « Fatou Ndiaye » et
 * « Fatou N'Diaye » sont deux ecritures d'une seule personne, pas deux
 * personnes. On regroupe donc d'abord les noms compatibles entre eux, puis on
 * compte les groupes obtenus.
 *
 * A partir de trois personnes distinctes, le contact est collectif : il ne
 * prouve plus rien. Deux, non — un couple, deux freres sur l'adresse de
 * famille : c'est courant, et la comparaison des noms suffit deja a les
 * separer. Trois marque le passage d'un contact partage a un contact de
 * service.
 *
 * Le contact reste affiche et sert toujours a ecrire aux gens. Il cesse
 * seulement de servir de preuve.
 */

const SEUIL_COLLECTIF = 3;

function mailNormalise(v) {
  const t = String(v || "").trim().toLowerCase();
  return t.includes("@") ? t : null;
}

function telNormalise(v) {
  const chiffres = String(v || "").replace(/\D+/g, "");
  if (!chiffres) return null;
  const sansIndicatif = chiffres.replace(/^(?:00221|221)/, "");
  return sansIndicatif.length >= 7 ? sansIndicatif : null;
}

/* Combien de personnes differentes ce contact accompagne-t-il ? Les noms
   compatibles comptent pour une : sans cela, deux orthographes d'un meme
   prenom suffiraient a declarer collectif le telephone de quelqu'un. */
function personnesDistinctes(fiches) {
  const groupes = [];
  for (const f of fiches) {
    const cle = clePersonne(f.nom, f.prenom);
    /* Une fiche sans nom exploitable ne permet de distinguer personne : on ne
       la compte pas, plutot que de gonfler le decompte a tort. */
    if (!cle) continue;
    const trouve = groupes.find((g) => g.some((autre) => nomsCompatibles(autre, f)));
    if (trouve) trouve.push(f);
    else groupes.push([f]);
  }
  return groupes.length;
}

/**
 * @param {Array} fiches  objets portant nom, prenom, email, telephone
 * @returns {{mails: Set<string>, tels: Set<string>}} les contacts qui ne
 *   prouvent plus rien, normalises comme ailleurs dans la plateforme.
 */
function contactsCollectifs(fiches) {
  const parMail = new Map();
  const parTel = new Map();

  for (const f of fiches || []) {
    const m = mailNormalise(f.email);
    if (m) {
      if (!parMail.has(m)) parMail.set(m, []);
      parMail.get(m).push(f);
    }
    const t = telNormalise(f.telephone);
    if (t) {
      if (!parTel.has(t)) parTel.set(t, []);
      parTel.get(t).push(f);
    }
  }

  const mails = new Set();
  for (const [m, liste] of parMail) {
    if (liste.length >= SEUIL_COLLECTIF && personnesDistinctes(liste) >= SEUIL_COLLECTIF) mails.add(m);
  }
  const tels = new Set();
  for (const [t, liste] of parTel) {
    if (liste.length >= SEUIL_COLLECTIF && personnesDistinctes(liste) >= SEUIL_COLLECTIF) tels.add(t);
  }

  return { mails, tels };
}

module.exports = { contactsCollectifs, mailNormalise, telNormalise, SEUIL_COLLECTIF };
