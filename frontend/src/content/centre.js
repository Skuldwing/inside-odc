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

export const MANIFESTE = {
  surtitre: "Ce que suit la plateforme",
  /* Le gras porte sur le nom, en tête de phrase. */
  nom: "Inside ODC",
  texte:
    " tient le registre d'un centre numérique : les formations qui s'y donnent, les personnes qui les suivent, les partenaires qui les portent et les machines qui servent. Une activité, une liste de présence, et le reste suit — statistiques, attestations, rapports.",
  note:
    "Outil indépendant, développé par Abdoul Mouhamed FALL. Il n'émane d'aucune entreprise et n'engage qu'elle-même.",
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

/* La vitrine ne doit pas faire oublier à quoi sert cette adresse : c'est aussi
   la porte d'entrée de l'outil interne. */
export const PLATEFORME = {
  surtitre: "Les coulisses",
  titre: "Inside ODC, l'outil de l'équipe",
  texte:
    "Derrière chaque atelier, il y a des inscriptions, des présences, des partenaires et un bilan à rendre. Inside ODC rassemble ce suivi en un seul endroit, pour que le temps passe avec les participants plutôt que sur des tableurs.",
  acces: "L'accès est réservé à l'équipe du centre et à ses partenaires.",
};

export const FINAL = {
  titre: "Le numérique s'apprend en le faisant",
  texte:
    "Le centre ouvre ses ateliers, ses machines et son accompagnement à celles et ceux qui veulent s'y mettre.",
};
