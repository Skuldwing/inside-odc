/* Ce que coutent les seances, par zone.
 *
 * Trois tarifs — Dakar, region, en ligne — et deux facons de payer : au
 * beneficiaire ou a l'heure. Le reste est de l'arithmetique, mais de
 * l'arithmetique qui porte sur de l'argent, donc deux precautions.
 *
 *
 * LA REPARTITION DU RETENU
 *
 * Le plafond est par partenaire : son realise est retenu a son objectif, et le
 * surplus attend en reserve. Les zones, elles, traversent les partenaires. Un
 * partenaire qui a forme 1000 personnes a Dakar et 1025 en region, pour un
 * objectif de 400, voit 400 retenues — mais lesquelles ? La question n'a pas de
 * reponse dans les donnees : la reserve est une quantite, pas un groupe de
 * personnes qu'on saurait designer.
 *
 * On repartit donc au prorata du realise de chaque zone. C'est le partage
 * neutre, celui qui ne favorise ni le tarif le plus cher ni le moins cher. Il
 * est affiche a l'ecran parce qu'il change un montant : personne ne doit le
 * decouvrir en relisant le code.
 *
 *
 * L'ARRONDI
 *
 * Un prorata donne des fractions, et un budget ne se paie pas en tiers de
 * personne. Arrondir chaque part separement ferait que la somme des lignes ne
 * tomberait pas sur le total — un ecart d'une ou deux unites, invisible, qui
 * suffit a faire douter de toute la page. On utilise la methode du plus fort
 * reste : les parts entieres d'abord, puis les unites restantes aux zones dont
 * la fraction perdue est la plus grande. La somme vaut alors exactement le
 * total, toujours.
 */
const { plafonnerObjectif } = require("./reservePartenaire");

const ZONES = ["dakar", "region", "ligne", "non_renseigne"];

const LIBELLES = {
  dakar: "Dakar",
  region: "Régions",
  ligne: "En ligne",
  non_renseigne: "Lieu non renseigné",
};

/* Quel tarif s'applique a quelle zone. « non_renseigne » n'en a aucun : on ne
   facture pas une seance dont on ignore ou elle s'est tenue. Elle reste
   affichee, avec son compte, pour qu'on la corrige — l'escamoter reviendrait a
   perdre des beneficiaires sans le dire. */
const TARIF_DE = {
  dakar: "tarif_dakar",
  region: "tarif_region",
  ligne: "tarif_ligne",
  non_renseigne: null,
};

/* Le classement, en SQL, pour que le regroupement se fasse en une passe.
 *
 * Le champ « lieu » est une liste deroulante des quatorze regions du Senegal,
 * donc « Dakar » arrive tel quel. Le LIKE couvre les saisies plus anciennes,
 * du temps ou le champ etait libre : « Dakar - Plateau », « dakar ». Tout
 * lieu renseigne qui n'est pas Dakar est une region ; un lieu vide ne se range
 * nulle part et le dit. */
const CAS_ZONE = `
  CASE
    WHEN COALESCE(a.mode, 'presentiel') = 'ligne' THEN 'ligne'
    WHEN a.location IS NULL OR TRIM(a.location) = '' THEN 'non_renseigne'
    WHEN LOWER(TRIM(a.location)) LIKE 'dakar%' THEN 'dakar'
    ELSE 'region'
  END
`;

function entier(v) {
  const n = Math.floor(Number(v) || 0);
  return n > 0 ? n : 0;
}

/**
 * Repartit « total » entre des parts, au prorata de « poids », sans rien perdre.
 *
 * @param {Array<{cle: string, poids: number}>} parts
 * @param {number} total
 * @returns {Map<string, number>} une part entiere par cle, dont la somme vaut
 *          exactement « total »
 */
function repartirAuProrata(parts, total) {
  const resultat = new Map(parts.map((p) => [p.cle, 0]));
  const cible = entier(total);
  if (cible === 0) return resultat;

  const somme = parts.reduce((s, p) => s + entier(p.poids), 0);
  /* Aucun poids mais un total a placer : on ne saurait pas ou le mettre. Le
     cas ne devrait pas exister — le total vient de la somme des poids — mais
     s'il survenait, mieux vaut ne rien repartir que de choisir au hasard. */
  if (somme === 0) return resultat;

  let place = 0;
  const restes = [];
  for (const p of parts) {
    const exact = (entier(p.poids) * cible) / somme;
    const entiere = Math.floor(exact);
    resultat.set(p.cle, entiere);
    place += entiere;
    restes.push({ cle: p.cle, reste: exact - entiere });
  }

  /* Les unites qui restent vont aux plus fortes fractions perdues. A fraction
     egale, l'ordre des zones tranche — pour que deux appels identiques donnent
     le meme resultat, et qu'un montant ne bouge pas d'un rafraichissement a
     l'autre. */
  restes.sort((a, b) => (b.reste - a.reste) || ZONES.indexOf(a.cle) - ZONES.indexOf(b.cle));
  for (let i = 0; i < cible - place; i += 1) {
    const r = restes[i % restes.length];
    resultat.set(r.cle, resultat.get(r.cle) + 1);
  }
  return resultat;
}

/**
 * Agrege les lignes « un partenaire, une zone » en un total par zone, en
 * appliquant le plafond de chaque partenaire.
 *
 * @param {Array} lignes  {partner_id, zone, beneficiaires, heures,
 *                         objective_beneficiaries, reserve_activee}
 * @returns {{zones: object, totaux: object}}
 */
function agregerParZone(lignes) {
  const zones = {};
  for (const z of ZONES) {
    zones[z] = { zone: z, libelle: LIBELLES[z], beneficiaires: 0, beneficiaires_reels: 0, en_reserve: 0, heures: 0 };
  }

  /* Un seau par partenaire — « null » compris, pour les seances sans
     partenaire : elles ne dependent d'aucun objectif, donc rien ne les
     plafonne, et elles doivent rester comptees. */
  const parPartenaire = new Map();
  for (const l of lignes) {
    const cle = l.partner_id == null ? "sans" : String(l.partner_id);
    if (!parPartenaire.has(cle)) {
      parPartenaire.set(cle, {
        objectif: l.objective_beneficiaries,
        reserve_activee: l.reserve_activee,
        parZone: [],
      });
    }
    parPartenaire.get(cle).parZone.push(l);
  }

  for (const p of parPartenaire.values()) {
    const brut = p.parZone.reduce((s, l) => s + entier(l.beneficiaires), 0);
    const calcul = plafonnerObjectif({
      objectif: p.objectif,
      realise: brut,
      reserve_activee: p.reserve_activee,
    });
    const retenuParZone = repartirAuProrata(
      p.parZone.map((l) => ({ cle: l.zone, poids: l.beneficiaires })),
      calcul.retenu
    );

    for (const l of p.parZone) {
      const z = zones[l.zone];
      if (!z) continue;
      const reel = entier(l.beneficiaires);
      const retenu = retenuParZone.get(l.zone) || 0;
      z.beneficiaires += retenu;
      z.beneficiaires_reels += reel;
      z.en_reserve += reel - retenu;
      z.heures += Math.max(0, Number(l.heures) || 0);
    }
  }

  return zones;
}

/**
 * Le chiffrage complet : par zone, avec le tarif, la quantite facturee et le
 * montant.
 */
function chiffrer(lignes, parametres) {
  const zones = agregerParZone(lignes);
  const mode = parametres?.mode_paiement === "heure" ? "heure" : "beneficiaire";

  const detail = ZONES.map((z) => {
    const brut = zones[z];
    const champ = TARIF_DE[z];
    const tarif = champ ? Number(parametres?.[champ] || 0) : null;
    /* A l'heure, le plafond ne s'applique pas : il est exprime en
       beneficiaires, et rien ne permet de le traduire en heures. On facture les
       heures reelles, et la page le dit. */
    const quantite = mode === "heure" ? arrondirHeures(brut.heures) : brut.beneficiaires;
    const montant = tarif == null ? null : Math.round(quantite * tarif);

    return {
      zone: z,
      libelle: brut.libelle,
      beneficiaires: brut.beneficiaires,
      beneficiaires_reels: brut.beneficiaires_reels,
      en_reserve: brut.en_reserve,
      heures: arrondirHeures(brut.heures),
      facturable: tarif != null,
      tarif,
      quantite,
      montant,
    };
  });

  const total = detail.reduce((s, d) => s + (d.montant || 0), 0);

  /* Ce que couterait la reserve si on l'activait. Chiffre a part : c'est un
     risque connu, pas une depense engagee — les confondre dans un seul nombre
     ferait perdre la distinction que toute la mecanique de reserve sert a
     tenir. */
  const coutReserve = detail.reduce(
    (s, d) => s + (d.facturable && mode === "beneficiaire" ? d.en_reserve * d.tarif : 0),
    0
  );

  return {
    mode_paiement: mode,
    devise: parametres?.devise || "FCFA",
    zones: detail,
    total,
    total_en_reserve: Math.round(coutReserve),
    beneficiaires: detail.reduce((s, d) => s + d.beneficiaires, 0),
    beneficiaires_reels: detail.reduce((s, d) => s + d.beneficiaires_reels, 0),
    en_reserve: detail.reduce((s, d) => s + d.en_reserve, 0),
    heures: arrondirHeures(detail.reduce((s, d) => s + d.heures, 0)),
    /* Ce qui n'a pas de tarif parce qu'on ignore ou ca s'est passe. Remonte au
       premier niveau pour que l'ecran puisse le signaler sans fouiller. */
    sans_lieu: detail.find((d) => d.zone === "non_renseigne")?.beneficiaires || 0,
  };
}

/* Les durees sont en « numeric » et s'additionnent en demi-heures. On garde une
   decimale : afficher « 1840,5 h » est juste, « 1840,4999 » ne l'est pas. */
function arrondirHeures(h) {
  return Math.round((Number(h) || 0) * 10) / 10;
}

module.exports = {
  ZONES,
  LIBELLES,
  CAS_ZONE,
  repartirAuProrata,
  agregerParZone,
  chiffrer,
};
