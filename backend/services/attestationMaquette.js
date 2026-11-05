const {
  composerAttestation, valeursExemple, VARIABLES,
} = require("./attestationPdfModele");

/**
 * Le style « maquette » : l'attestation est dessinée sur le PDF déposé par
 * l'équipe, et non sur un dessin écrit dans le code.
 *
 * Ce fichier ne fait qu'une chose : traduire ce que la plateforme sait d'une
 * participation — une personne, une séance, une date — en valeurs pour les
 * marqueurs de la maquette. Le dessin, lui, appartient à celui qui l'a fait
 * dans PowerPoint.
 */

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function enToutesLettres(valeur) {
  if (!valeur) return "";
  const d = valeur instanceof Date ? valeur : new Date(valeur);
  if (Number.isNaN(d.getTime())) return String(valeur);
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* Un nom de famille s'écrit en capitales sur une attestation : c'est l'usage,
   et cela lève l'ambiguïté quand prénom et nom se ressemblent — « Fall
   Mouhamed » et « Mouhamed Fall » ne se distinguent pas autrement. */
function capitales(texte) {
  return String(texte || "").trim().toLocaleUpperCase("fr");
}

function valeursPour({ participant = {}, activity = {}, module: intitule, modele = {} }) {
  const prenom = String(participant.prenom || "").trim();
  const nom = capitales(participant.nom);
  const heures = Number(activity.duration_hours || 0);

  return {
    prenom,
    nom,
    nom_complet: [prenom, nom].filter(Boolean).join(" "),
    activite: String(intitule || activity.title || "").trim(),
    date: enToutesLettres(activity.activity_date),
    lieu: activity.location && activity.location !== "-" ? activity.location : "Dakar",
    duree: heures > 0 ? `${heures} heure${heures > 1 ? "s" : ""}` : "",
    dispositif: activity.device_name || "",
    /* Qui a animé : le partenaire s'il y en a un, le formateur sinon. C'est la
       même règle que dans les courriels d'attestation. */
    organisateur: activity.partner_name || activity.coach_name || modele.organisation || "",
    aujourdhui: enToutesLettres(new Date()),
  };
}

async function genererAttestationMaquette(options = {}) {
  const modele = options.modele || {};
  if (!modele.fond_pdf) {
    /* Ne devrait pas arriver : le style n'est proposé qu'une fois la maquette
       déposée. On le dit clairement plutôt que de laisser pdf-lib échouer sur
       un « cannot read properties of null ». */
    throw new Error(
      "Ce modèle est réglé sur « maquette » mais aucun PDF n'y est déposé."
    );
  }

  return composerAttestation({
    fond: modele.fond_pdf,
    zones: Array.isArray(modele.zones) ? modele.zones : [],
    valeurs: valeursPour(options),
    couleurFond: modele.couleur_fond || "#FFFFFF",
  });
}

/* Le style n'a besoin d'aucune ressource sur le disque : sa maquette vit en
   base. Rien ne manque jamais. */
function ressourcesPresentes() {
  return [];
}

module.exports = {
  genererAttestationMaquette,
  ressourcesPresentes,
  valeursPour,
  valeursExemple,
  VARIABLES,
};
