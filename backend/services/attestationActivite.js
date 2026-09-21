const { generateAttestationPDF } = require("./attestation");
const { genererAttestationTechKi, ressourcesPresentes } = require("./attestationTechKi");
const { modelePourActivite } = require("../routes/modelesAttestation.routes");

/**
 * L'attestation d'une personne pour une activite.
 *
 * Cette fabrication vivait dans la route des activites, qui etait le seul
 * endroit a en produire. L'envoi participant par participant en produit
 * plusieurs d'un coup, pour des activites differentes : sans une definition
 * unique, les deux chemins auraient fini par diverger — un modele applique
 * ici, pas la ; un intitule borne d'un cote, brut de l'autre.
 */

/* Le modele Tech-Ki fourni par l'equipe remplace le rendu generique des que
   ses ressources sont en place — fond, logo, signature, police manuscrite.
   Si l'une manque, on retombe sur l'ancien rendu plutot que d'echouer. */
const MODELE_TECH_KI_DISPONIBLE = ressourcesPresentes().length === 0;
if (!MODELE_TECH_KI_DISPONIBLE) {
  console.warn(
    "[ATTESTATION] modele Tech-Ki indisponible, ressources manquantes :",
    ressourcesPresentes().join(", ")
  );
}

/* L'intitule du module tel qu'il sera trace sur le document. Par defaut celui
   de l'activite, mais un titre interne — « Atelier IA - session 3 (reporte) »
   — n'a rien a faire sur une attestation remise a un beneficiaire. L'appelant
   peut donc le reecrire. On borne la longueur : au-dela, le rendu reduit la
   police jusqu'a l'illisible pour faire tenir le texte sur sa ligne. */
const LONGUEUR_MODULE_MAX = 120;

function moduleRetenu(activity, remplacement) {
  const propose = String(remplacement ?? "").trim();
  return (propose || activity.title || "").slice(0, LONGUEUR_MODULE_MAX);
}

async function attestationPourActivite({ participant, activity, module: intituleModule }) {
  if (MODELE_TECH_KI_DISPONIBLE) {
    /* Le dispositif peut avoir son propre modele : la Tech Academy menee avec
       le COJOJ porte le logo et la mention du partenaire. A defaut, le modele
       par defaut ; a defaut encore, les valeurs d'origine du rendu. */
    const modele = await modelePourActivite(activity);
    return genererAttestationTechKi({
      participant,
      /* Le module imprime sur la ligne est l'intitule de la seance : c'est ce
         que la personne a suivi, plus parlant que le nom du dispositif. */
      module: moduleRetenu(activity, intituleModule),
      date: activity.activity_date,
      lieu: activity.location && activity.location !== "-" ? activity.location : "Dakar",
      modele: modele || {},
    });
  }
  return generateAttestationPDF({
    participant,
    activity,
    partner: activity.partner_name || activity.coach_name,
    device: activity.device_name,
  });
}

module.exports = {
  attestationPourActivite,
  moduleRetenu,
  MODELE_TECH_KI_DISPONIBLE,
  LONGUEUR_MODULE_MAX,
};
