/**
 * Qui edite cette plateforme, et sous quel nom elle s'adresse au dehors.
 *
 * Le nom etait ecrit en dur a une trentaine d'endroits : gabarits d'emails,
 * attestations, rapports PDF, page de desabonnement. Le changer supposait de
 * les retrouver tous, et d'en oublier. Il est desormais defini ici, une fois.
 *
 * La plateforme s'appelait « Orange Digital Center Senegal ». Elle n'est pas
 * editee par Orange ni par Sonatel : c'est un outil personnel, construit pour
 * le travail de son auteur. S'en presenter comme le centre lui-meme n'etait
 * pas soutenable — ni vis-a-vis des destinataires, ni vis-a-vis des services
 * de conformite qui verifient un expediteur avant de l'autoriser a envoyer.
 */

const IDENTITE = {
  /* Nom complet, pour les signatures et les pieds de page. */
  nom: "Inside ODC Sénégal",

  /* Forme courte, pour les en-tetes et les endroits etroits. */
  nomCourt: "Inside ODC",

  /* Ce que la plateforme est, en une ligne. */
  description: "Plateforme de suivi des activités, des bénéficiaires et des partenaires",

  domaine: "inside-odc.com",
  siteUrl: "https://inside-odc.com",
  contact: "contact@inside-odc.com",
};

module.exports = { IDENTITE };
