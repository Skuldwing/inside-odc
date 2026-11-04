/* ─────────────────────────────────────────────────────────────────────────
   TEXTES À VALIDER PAR L'ÉQUIPE ODC

   Tout ce qui décrit le centre est regroupé ici pour être relu et corrigé en
   un seul endroit, sans toucher à la mise en page.

   Ces formulations décrivent le modèle d'un centre numérique tel qu'il est
   présenté publiquement. Elles n'avancent volontairement aucun chiffre —
   nombre de personnes formées, de projets accompagnés, dates — car aucune
   source interne ne les a fournies. Mieux vaut une page sobre qu'une page qui
   affiche des données inventées au nom du centre.


   POURQUOI CE FICHIER EST SÉPARÉ DE LA PAGE

   La page d'accueil est dessinée par le navigateur : un robot qui n'exécute
   pas le JavaScript — et c'est le cas de WhatsApp, de Facebook, de LinkedIn au
   moment d'afficher l'aperçu d'un lien partagé, comme de la plupart des
   robots des moteurs de recherche par intelligence artificielle — recevait un
   document vide. Zéro mot, aucun titre.

   Une version statique de cette page est donc écrite dans le document au
   moment de la construction, par un greffon qui lit CE fichier. Les deux
   versions disent ainsi la même chose sans que personne n'ait à les tenir
   d'accord : il n'y a qu'un seul texte, et il est ici.

   Ce fichier ne doit donc rien importer. Il est lu aussi bien par le
   navigateur que par Node au moment de la construction, et la moindre
   dépendance — une icône, une feuille de style — ferait échouer la seconde
   lecture, donc la construction du site.
   ───────────────────────────────────────────────────────────────────────── */

export const HERO = {
  surtitre: "Inside ODC · Sénégal",
  /* Coupé en deux pour le dégradé du second morceau. Assemblé tel quel dans la
     version statique. */
  titre: ["Apprendre, créer,", "entreprendre."],
  chapo:
    "Un même lieu pour se former aux métiers du numérique, fabriquer un premier prototype et faire grandir un projet. Ouvert à celles et ceux qui veulent s'y mettre, quel que soit leur point de départ.",
};

/* Cette section décrivait l'outil de suivi : « Inside ODC tient le registre
   d'un centre numérique… ». La page d'accueil s'adresse au public, qui n'a
   rien à faire du logiciel de l'équipe — elle ne parle donc plus que du
   centre. La section « Les coulisses », qui présentait la plateforme interne,
   a disparu pour la même raison. */
export const CENTRE = {
  surtitre: "Le centre",
  titre: "Un lieu, des machines, une équipe",
  texte:
    "Des salles de formation, un atelier de fabrication numérique, et des personnes pour accompagner. On y vient pour apprendre un métier, pour fabriquer un premier objet, ou pour faire grandir un projet déjà lancé.",
  note: "Quatre pôles, et chacun répond à un moment du parcours.",
};

/* Qui édite ce site.
 *
 * Cette phrase vivait dans la section ci-dessus, qui a été réécrite. Elle est
 * descendue au pied de page plutôt que supprimée, et ce n'est pas un détail :
 * c'est la seule mention, hors mentions légales, que ce site n'est pas celui
 * d'Orange ni de Sonatel.
 *
 * Sans elle, il reste une page qui parle d'Orange Digital Center sur un
 * domaine déposé au nom d'un particulier — un profil indiscernable d'une
 * usurpation de marque, qui est précisément ce que vérifie un service de
 * conformité avant d'autoriser un compte d'envoi. C'est ce qui avait déjà
 * valu un refus. */
export const EDITEUR = {
  resume:
    "Centre numérique au Sénégal : formation aux métiers du numérique, fabrication et accompagnement de projets.",
  mention:
    "Site indépendant, édité par Abdoul Mouhamed FALL. Il n'émane d'aucune entreprise et n'engage que lui-même.",
};

export const POLES = {
  surtitre: "Les pôles",
  titre: "Quatre portes d'entrée, un seul parcours",
  chapo:
    "Chacun répond à un moment différent. On peut n'en pousser qu'une, ou les traverser toutes.",
  items: [
    {
      cle: "code",
      titre: "École du code",
      texte:
        "Une formation aux métiers du développement, gratuite et ouverte sans condition de diplôme, pour entrer dans le numérique par la pratique.",
    },
    {
      cle: "fablab",
      titre: "FabLab Solidaire",
      texte:
        "Un atelier de fabrication numérique : impression 3D, prototypage, électronique, et l'initiation des plus jeunes à la création.",
    },
    {
      cle: "accelerateur",
      titre: "Accélérateur",
      texte:
        "L'accompagnement des jeunes entreprises déjà lancées : mentorat, mise en relation, accès à l'écosystème du groupe.",
    },
    {
      cle: "investissement",
      titre: "Investissement",
      texte:
        "Le relais de financement pour les projets prêts à changer d'échelle, une fois le modèle éprouvé.",
    },
  ],
};

export const PUBLICS = {
  surtitre: "Pour qui",
  titre: "Le centre s'adresse à qui pousse la porte",
  items: [
    {
      cle: "formation",
      titre: "Celles et ceux qui se forment",
      texte:
        "Jeunes en recherche de compétences, en reconversion, ou simplement curieux d'un métier du numérique.",
    },
    {
      cle: "projet",
      titre: "Les porteurs de projet",
      texte:
        "D'une idée griffonnée à une entreprise qui recrute, chaque étape trouve un interlocuteur au centre.",
    },
    {
      cle: "scolaires",
      titre: "Les scolaires et les enseignants",
      texte:
        "Ateliers d'initiation, découverte du code et de la fabrication numérique, encadrés par l'équipe.",
    },
  ],
};

export const FINAL = {
  titre: "Le numérique s'apprend en le faisant",
  texte:
    "Le centre ouvre ses ateliers, ses machines et son accompagnement à celles et ceux qui veulent s'y mettre.",
};
