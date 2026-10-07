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
 * @param {Array} lignes  {partner_id, partenaire, zone, beneficiaires, heures,
 *                         objective_beneficiaries, reserve_activee}
 * @returns {{zones: object, partenaires: Array}}
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
        partner_id: l.partner_id ?? null,
        nom: l.partenaire || (l.partner_id == null ? "Sans partenaire" : `Partenaire #${l.partner_id}`),
        objectif: l.objective_beneficiaries,
        reserve_activee: l.reserve_activee,
        parZone: [],
      });
    }
    parPartenaire.get(cle).parZone.push(l);
  }

  const partenaires = [];
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

    /* Le detail par zone de ce partenaire est conserve : c'est lui qui portera
       les tarifs, puisqu'un meme partenaire peut intervenir a Dakar et en
       region, qui ne se facturent pas au meme prix. Additionner d'abord ses
       beneficiaires puis appliquer un tarif unique serait faux. */
    const zonesDuPartenaire = {};
    for (const l of p.parZone) {
      const z = zones[l.zone];
      if (!z) continue;
      const reel = entier(l.beneficiaires);
      const retenu = retenuParZone.get(l.zone) || 0;
      const heures = Math.max(0, Number(l.heures) || 0);

      z.beneficiaires += retenu;
      z.beneficiaires_reels += reel;
      z.en_reserve += reel - retenu;
      z.heures += heures;

      zonesDuPartenaire[l.zone] = { retenu, reel, en_reserve: reel - retenu, heures };
    }

    partenaires.push({
      partner_id: p.partner_id,
      nom: p.nom,
      objectif: calcul.objectif,
      beneficiaires: calcul.retenu,
      beneficiaires_reels: calcul.brut,
      en_reserve: calcul.reserve_disponible,
      plafonne: calcul.plafonne,
      heures: p.parZone.reduce((s, l) => s + Math.max(0, Number(l.heures) || 0), 0),
      zones: zonesDuPartenaire,
    });
  }

  return { zones, partenaires };
}

/**
 * Le chiffrage complet : par zone, avec le tarif, la quantite facturee et le
 * montant.
 */
function chiffrer(lignes, parametres) {
  const { zones, partenaires } = agregerParZone(lignes);
  const mode = parametres?.mode_paiement === "heure" ? "heure" : "beneficiaire";
  const tarifDe = (z) => {
    const champ = TARIF_DE[z];
    return champ ? Number(parametres?.[champ] || 0) : null;
  };

  /* A l'heure, le plafond ne s'applique pas : il est exprime en beneficiaires,
     et rien ne permet de le traduire en heures. On facture les heures reelles,
     et la page le dit. */
  const quantiteDe = (seau) =>
    mode === "heure" ? arrondirHeures(seau.heures) : seau.retenu ?? seau.beneficiaires;

  const detail = ZONES.map((z) => {
    const brut = zones[z];
    const tarif = tarifDe(z);
    const quantite = mode === "heure" ? arrondirHeures(brut.heures) : brut.beneficiaires;
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
      /* Montant exact, non arrondi. Les deux tableaux — par zone et par
         partenaire — decoupent le meme ensemble de couples (partenaire, zone) :
         tant qu'on n'arrondit pas chaque ligne, leurs sommes sont rigoureusement
         egales et les deux totaux affiches coincident. Arrondir ligne a ligne
         ferait diverger les deux tableaux des que les tarifs portent des
         centimes, et rien n'est plus inquietant sur une page de budget que deux
         totaux differents pour la meme periode. */
      montant: tarif == null ? null : quantite * tarif,
    };
  });

  const parPartenaire = partenaires
    .map((p) => {
      let montant = 0;
      let facturable = 0;
      /* Le detail zone par zone de ce partenaire, rendu a l'ecran : c'est ce
         qui permet de lire son montant, puisqu'il ne se deduit pas d'un nombre
         unique de beneficiaires. Toutes les zones sont presentes, y compris
         celles ou il n'a rien fait, pour que le tableau garde des colonnes
         alignees d'une ligne a l'autre. */
      const parZone = {};
      for (const z of ZONES) {
        const seau = p.zones[z] || { retenu: 0, reel: 0, en_reserve: 0, heures: 0 };
        const tarif = tarifDe(z);
        const q = quantiteDe(seau);
        parZone[z] = {
          beneficiaires: seau.retenu,
          beneficiaires_reels: seau.reel,
          en_reserve: seau.en_reserve,
          heures: arrondirHeures(seau.heures),
          montant: tarif == null ? null : q * tarif,
        };
        if (tarif == null) continue;
        montant += q * tarif;
        facturable += q;
      }
      return {
        partner_id: p.partner_id,
        nom: p.nom,
        objectif: p.objectif,
        beneficiaires: p.beneficiaires,
        beneficiaires_reels: p.beneficiaires_reels,
        en_reserve: p.en_reserve,
        plafonne: p.plafonne,
        heures: arrondirHeures(p.heures),
        quantite_facturee: mode === "heure" ? arrondirHeures(facturable) : facturable,
        zones: parZone,
        montant,
      };
    })
    .sort((a, b) => b.montant - a.montant || a.nom.localeCompare(b.nom, "fr"));

  const total = Math.round(detail.reduce((s, d) => s + (d.montant || 0), 0));

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
    partenaires: parPartenaire,
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
