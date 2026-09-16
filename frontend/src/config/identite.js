/**
 * Qui édite cette plateforme, et sous quel nom elle s'adresse au dehors.
 *
 * Pendant du fichier du même nom côté serveur — les deux doivent dire la même
 * chose, une attestation et le pied de page qui l'annonce ne peuvent pas
 * porter deux noms différents.
 *
 * La plateforme s'appelait « Orange Digital Center Sénégal ». Elle n'est pas
 * éditée par Orange ni par Sonatel : c'est un outil personnel, construit pour
 * le travail de son auteur.
 */

export const IDENTITE = {
  /* Nom complet, pour les signatures et les pieds de page. */
  nom: "Inside ODC Sénégal",

  /* Forme courte, pour les en-têtes et les endroits étroits. */
  nomCourt: "Inside ODC",

  /* Ce que la plateforme est, en une ligne. */
  description: "Plateforme de suivi des activités, des bénéficiaires et des partenaires",

  domaine: "inside-odc.com",
  siteUrl: "https://inside-odc.com",
  contact: "contact@inside-odc.com",
};

export default IDENTITE;
