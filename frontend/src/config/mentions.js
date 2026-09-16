/**
 * Identité de l'éditeur du site, affichée sur /mentions-legales.
 *
 * La plateforme est un projet personnel. Elle n'émane d'aucune entreprise et
 * n'est adossée à aucune marque — c'est ce que ces mentions disent, et c'est
 * précisément ce qu'un service de conformité cherche à établir avant
 * d'autoriser un expéditeur.
 *
 * Une valeur laissée vide s'affiche « à compléter » sur la page, plutôt que
 * d'être devinée.
 */

export const MENTIONS = {
  domaine: "inside-odc.com",

  /* Projet personnel : l'éditeur est une personne physique, pas une société.
     C'est une mention parfaitement régulière, et la seule exacte ici. */
  editeurEstParticulier: true,

  responsable: "Abdoul Mouhamed FALL",

  /* Ville et pays suffisent pour un éditeur particulier : l'adresse postale
     complète d'une personne physique n'a pas à être publiée. */
  lieu: "Dakar, Sénégal",

  /* Adresse de contact affichée publiquement. */
  contact: "contact@inside-odc.com",

  /* Adresse d'expédition des messages sortants, et adresse de réponse. */
  expediteur: "contact@inside-odc.com",
  reponse: "abdoulmouhamed.fall@orange-sonatel.com",
};
