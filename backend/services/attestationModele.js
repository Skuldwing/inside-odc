const techKi = require("./attestationTechKi");
const kidsTech = require("./attestationKidsTech");
const maquette = require("./attestationMaquette");

/**
 * Quel dessin pour quel modele.
 *
 * Un modele d'attestation ne porte plus seulement des textes : il porte aussi
 * la maquette sur laquelle ils s'ecrivent. Le Tech-Ki s'adresse a des adultes
 * en formation professionnelle ; le Kids Tech, illustre, s'adresse a des
 * enfants — c'est celui des attestations de Super Codeur.
 *
 * Ce module est le seul endroit qui connait la correspondance. Les routes et
 * l'envoi appellent « genererAttestation » et ne savent pas laquelle des deux
 * maquettes est dessinee : ajouter une troisieme ne les touchera pas.
 */

const STYLES = {
  "tech-ki": {
    libelle: "Tech-Ki",
    description: "Le modèle d'origine : sobre, pour les formations adultes.",
    generer: techKi.genererAttestationTechKi,
    manquantes: techKi.ressourcesPresentes,
  },
  "kids-tech": {
    libelle: "Kids Tech",
    description:
      "Illustré et coloré, pour les enfants — attestations de participation ou de Super Codeur.",
    generer: kidsTech.genererAttestationKidsTech,
    manquantes: kidsTech.ressourcesPresentes,
  },
  /* Le troisième n'a pas de dessin à lui : il prend celui que l'équipe
     dépose. C'est l'intérêt — ajouter une maquette ne demande plus de
     toucher au code, seulement de l'envoyer depuis l'écran. */
  maquette: {
    libelle: "Ma maquette",
    description:
      "Votre propre document, dessiné dans PowerPoint puis exporté en PDF. La plateforme y écrit les noms à la place des marqueurs.",
    generer: maquette.genererAttestationMaquette,
    manquantes: maquette.ressourcesPresentes,
    /* Ce style ne vaut que pour un modèle qui porte un PDF : l'écran ne le
       propose donc qu'une fois la maquette déposée. */
    exigeFond: true,
  },
};

const STYLE_PAR_DEFAUT = "tech-ki";

/* Une valeur inconnue — un modele cree avant l'ajout d'un style, une saisie
   fantaisiste — retombe sur le dessin d'origine plutot que de faire echouer la
   delivrance du document. */
function styleRetenu(valeur) {
  const v = String(valeur || "").trim().toLowerCase();
  return STYLES[v] ? v : STYLE_PAR_DEFAUT;
}

function genererAttestation(options = {}) {
  const style = styleRetenu(options.modele?.style);
  return STYLES[style].generer(options);
}

/* Ce qui manque a chaque maquette pour etre dessinee. Vide partout = tout est
   en place. */
function ressourcesManquantes() {
  const manquantes = {};
  for (const [cle, s] of Object.entries(STYLES)) {
    const liste = s.manquantes();
    if (liste.length) manquantes[cle] = liste;
  }
  return manquantes;
}

/* Ce que l'interface propose dans son menu. */
function stylesDisponibles() {
  return Object.entries(STYLES).map(([cle, s]) => ({
    cle, libelle: s.libelle, description: s.description,
  }));
}

module.exports = {
  genererAttestation,
  styleRetenu,
  stylesDisponibles,
  ressourcesManquantes,
  STYLE_PAR_DEFAUT,
};
