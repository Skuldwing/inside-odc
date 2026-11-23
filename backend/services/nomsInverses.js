/**
 * Repérer les fiches où le nom et le prénom ont été inversés.
 *
 * Une liste de présence remplie à la main mélange les deux : « FALL » dans la
 * case prénom, « Abdoul » dans la case nom. L'attestation imprime alors
 * « Fall Abdoul », la recherche de doublons ne rapproche plus cette fiche des
 * autres de la même personne, et la déduction du genre, qui lit le prénom,
 * cherche un prénom « Fall » et ne trouve rien.
 *
 * ---- LA SOURCE : LA BASE ELLE-MÊME ----
 *
 * Comme pour le genre. « Fall » figure des centaines de fois dans la colonne
 * des noms et presque jamais dans celle des prénoms ; « Abdoul », l'inverse.
 * Pour chaque valeur on compte combien de personnes la portent comme nom et
 * comme prénom.
 *
 * ---- LA RÈGLE, ET POURQUOI ELLE DEMANDE LES DEUX CÔTÉS ----
 *
 * Une fiche n'est signalée que si les DEUX cases se trompent de colonne :
 * la valeur de la case prénom est un nom dans au moins PART_MIN des cas, ET
 * celle de la case nom est un prénom dans au moins PART_MIN des cas — chacune
 * vue au moins MIN_VUES fois. Un seul côté ne suffit pas : « Diop Khadim »
 * avec un prénom « Khadim » rare dans la base ne dit rien d'une inversion, il
 * dit seulement que Khadim est rare. Exiger les deux, c'est ne signaler que
 * ce dont la base est sûre.
 *
 * On compte des personnes et non des fiches, pour qu'une même personne
 * inscrite dix fois ne pèse pas dix fois. Les fiches inversées elles-mêmes
 * entrent dans le comptage — elles y sont minoritaires, et le seuil de 90 %
 * les absorbe.
 */

const { normaliserPrenom: normaliser } = require("./genreParPrenom");

const MIN_VUES = 5;
const PART_MIN = 0.9;

const incrementer = (table, cle) => table.set(cle, (table.get(cle) || 0) + 1);
const tete = (v) => v.split(" ")[0];

/**
 * Combien de personnes portent chaque valeur comme nom, et comme prénom.
 * Le premier mot du prénom est compté à part : « Abdoul Aziz » écrit dans la
 * case nom se reconnaît à son « Abdoul ».
 */
function compterRoles(fiches) {
  const vues = new Set();
  const roles = { prenom: new Map(), nom: new Map(), prenomTete: new Map() };
  for (const f of fiches) {
    const nom = normaliser(f.nom);
    const prenom = normaliser(f.prenom);
    if (!nom || !prenom) continue;
    const personne = `${nom}|${prenom}`;
    if (vues.has(personne)) continue;
    vues.add(personne);
    incrementer(roles.nom, nom);
    incrementer(roles.prenom, prenom);
    incrementer(roles.prenomTete, tete(prenom));
  }
  return roles;
}

/* La part d'une valeur dans un rôle, avec le nombre de fois qu'elle a été
   vue en tout. */
function part(n, autre) {
  const total = n + autre;
  return { part: total ? n / total : 0, vues: total };
}

/* La valeur de la case prénom est-elle un nom de famille ? */
function commeNom(valeur, roles) {
  const r = part(roles.nom.get(valeur) || 0, roles.prenom.get(valeur) || 0);
  return { ...r, oui: r.vues >= MIN_VUES && r.part >= PART_MIN };
}

/* La valeur de la case nom est-elle un prénom ? D'abord entière, puis par
   son premier mot pour un prénom composé. */
function commePrenom(valeur, roles) {
  const entier = part(roles.prenom.get(valeur) || 0, roles.nom.get(valeur) || 0);
  if (entier.vues >= MIN_VUES) return { ...entier, oui: entier.part >= PART_MIN };
  if (!valeur.includes(" ")) return { ...entier, oui: false };
  const t = tete(valeur);
  const parTete = part(roles.prenomTete.get(t) || 0, roles.nom.get(t) || 0);
  return { ...parTete, oui: parTete.vues >= MIN_VUES && parTete.part >= PART_MIN };
}

/**
 * Les fiches dont le nom et le prénom semblent inversés.
 *
 * @param {Array<{id, nom, prenom}>} fiches  toutes les fiches de la base
 * @returns {Array<{id, nom, prenom, appui}>}
 */
function detecter(fiches) {
  const roles = compterRoles(fiches);
  const suspects = [];
  for (const f of fiches) {
    const nom = normaliser(f.nom);
    const prenom = normaliser(f.prenom);
    if (!nom || !prenom || nom === prenom) continue;
    const pNom = commeNom(prenom, roles);
    if (!pNom.oui) continue;
    const nPrenom = commePrenom(nom, roles);
    if (!nPrenom.oui) continue;
    suspects.push({
      id: f.id,
      nom: f.nom,
      prenom: f.prenom,
      /* De quoi juger : la part de chaque valeur dans l'autre colonne. */
      appui: {
        prenom_comme_nom: Math.round(pNom.part * 100),
        nom_comme_prenom: Math.round(nPrenom.part * 100),
      },
    });
  }
  return suspects;
}

/* Une valeur de la case prénom qui ressemble à un nom, même quand la case nom
   ne permet pas de conclure. Sert à expliquer pourquoi la déduction du genre
   a échoué. */
function ressembleNom(valeur, roles) {
  return commeNom(normaliser(valeur), roles).oui;
}

module.exports = { MIN_VUES, PART_MIN, compterRoles, detecter, ressembleNom };
