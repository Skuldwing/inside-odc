/**
 * Identité de l'exploitant du site, affichée sur /mentions-legales.
 *
 * Ces valeurs ne sont pas devinables depuis le code : elles engagent une
 * personne et une entité. Elles sont donc rassemblées ici, en clair, pour que
 * l'exploitant les renseigne lui-même.
 *
 * Une valeur laissée vide s'affiche « à compléter » sur la page. C'est
 * volontaire : une mention légale incomplète et honnête vaut mieux qu'une
 * mention légale inventée — laquelle serait exactement le défaut qu'elle est
 * censée corriger.
 */

export const MENTIONS = {
  domaine: "inside-odc.com",

  /* Nom exact de l'entité qui édite le site, tel qu'il figure sur ses
     documents officiels. Exemple : « Sonatel SA ». */
  entite: "",

  /* Forme juridique, capital, numéro d'immatriculation au registre du
     commerce (NINEA / RCCM pour le Sénégal). */
  immatriculation: "",

  /* Adresse postale de l'entité. */
  adresse: "",

  /* Personne responsable de la publication. */
  responsable: "Abdoul Mouhamed FALL",

  /* Adresse de contact affichée publiquement. */
  contact: "contact@inside-odc.com",

  /* Adresse d'expédition des messages sortants, et adresse de réponse. */
  expediteur: "contact@inside-odc.com",
  reponse: "abdoulmouhamed.fall@orange-sonatel.com",

  /* Comment l'usage de la marque est autorisé. Cette phrase se lit à la suite
     de « sont utilisés ici ». Exemple : « avec l'autorisation de Sonatel SA,
     dans le cadre de l'exploitation de l'Orange Digital Center Sénégal ».
     C'est la mention que vérifie un service de conformité : elle doit
     correspondre à une autorisation réelle. */
  autorisation: "",
};
