const pool = require("../db");
const { RETENTION_JOURS, ESPACES } = require("../migrations/audience");

/**
 * Ce qui entre dans la mesure d'audience, et ce qui en sort.
 *
 * L'adresse qui recoit les signaux est publique : elle doit l'etre, puisque le
 * visiteur de la page d'accueil n'a pas de compte. Tout ce qui arrive est donc
 * suppose hostile, et rien n'est ecrit sans avoir ete reconnu. Les noms
 * d'evenements viennent d'une liste fermee ; ce qui n'y figure pas est jete
 * sans erreur — un ecran reste d'un deploiement precedent ne doit pas se
 * mettre a recevoir des refus, il doit juste ne rien compter.
 *
 * Le Senegal vit a l'heure UTC : une journee civile et une journee UTC sont la
 * meme chose. Les dates sont donc calculees en UTC partout, sans conversion,
 * et il n'y a pas de minuit ambigu.
 */

/* Ce qu'on accepte de compter. La valeur est contrainte par perimetre : une
   section de la page d'accueil n'a pas de sens dans l'espace beneficiaire.

   « source » et « appareil » ne figurent pas ici : leur valeur est ouverte et
   passe par une normalisation a part. */
const EVENEMENTS = {
  /* Jusqu'ou le visiteur descend dans la page d'accueil. Une section compte
     une fois par visite : c'est « il y est arrive », pas « il l'a regardee
     douze fois ». */
  /* « plateforme » a disparu avec la section qui presentait l'outil interne :
     la page d'accueil ne parle plus que du centre. Les quelques lignes deja
     comptees sous ce nom restent en base sans gener — elles cessent
     simplement d'etre affichees, puisque cette liste donne aussi l'ordre de
     lecture. */
  section: ["top", "centre", "poles", "publics", "final"],

  /* Ce sur quoi il clique. Les noms sont poses dans le gabarit de la page
     d'accueil, en attribut « data-audience ». */
  clic: ["espace", "espace-hero", "decouvrir", "poles", "mentions", "contact"],

  /* Le parcours de l'espace beneficiaire. Compte au serveur, sur les routes
     qui existent deja : ces quatre nombres sont donc exacts et personne ne
     peut les gonfler depuis un navigateur. */
  lien_demande: [""],
  lien_envoye: [""],
  session_ouverte: [""],
  attestation: [""],
};

/* Les deux dimensions a valeur ouverte, comptees comme des evenements pour
   survivre a l'oubli du detail des visites. */
const APPAREILS = ["mobile", "tablette", "ordinateur"];

/* Un signal porte au plus cinq minutes : le navigateur envoie toutes les
   vingt-cinq secondes de presence effective, et vide son compteur en quittant
   la page. Au-dela, c'est une valeur fabriquee. */
const SECONDES_MAX_PAR_SIGNAL = 300;

/* ===== NORMALISATION ===== */

function espaceValide(v) {
  const s = String(v || "").trim().toLowerCase();
  return ESPACES.includes(s) ? s : null;
}

/* La cle d'une visite est un numero tire au hasard par le navigateur. On
   verifie sa forme, pas sa provenance : il n'y a rien derriere a proteger. */
function cleValide(v) {
  const s = String(v || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-?[0-9a-f-]{8,40}$/.test(s) && s.length <= 48 ? s : null;
}

function entierBorne(v, min, max) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/* D'ou vient le visiteur.
 *
 * On ne garde que le nom d'hote, jamais l'adresse complete : le chemin d'une
 * page de provenance peut contenir une recherche, un identifiant, un nom. Le
 * domaine suffit a repondre a la question posee — « par ou arrivent-ils ? » —
 * et ne dit rien de personne. */
function normaliserSource(brut) {
  const s = String(brut || "").trim().toLowerCase();
  if (!s || s === "direct") return "direct";
  if (s === "interne") return "interne";

  const hote = s.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].replace(/^www\./, "");
  if (!/^[a-z0-9]([a-z0-9.-]{1,61}[a-z0-9])?\.[a-z]{2,24}$/.test(hote)) return "direct";

  /* Les grandes familles sont regroupees : « m.facebook.com », « l.facebook.com »
     et « facebook.com » sont la meme reponse a la question posee, et les separer
     eparpille le compte en trois lignes dont aucune ne dit la verite. */
  const familles = [
    [/(^|\.)google\./, "google"],
    [/(^|\.)(facebook|fb)\./, "facebook"],
    [/(^|\.)(instagram)\./, "instagram"],
    [/(^|\.)(linkedin|lnkd)\./, "linkedin"],
    [/(^|\.)(whatsapp|wa\.me)/, "whatsapp"],
    [/(^|\.)(twitter|x)\.com$/, "x"],
    [/(^|\.)(youtube|youtu)\./, "youtube"],
    [/(^|\.)(tiktok)\./, "tiktok"],
    [/(^|\.)(bing|duckduckgo|yahoo|qwant|ecosia)\./, "autre moteur"],
  ];
  for (const [motif, nom] of familles) if (motif.test(hote)) return nom;

  return hote.slice(0, 64);
}

/* ===== LE PLAFOND DE CARDINALITÉ =====
 *
 * « source » est la seule valeur qu'on accepte sans liste fermee : une
 * provenance nouvelle est precisement ce qu'on veut decouvrir. Mais une adresse
 * publique qui cree une ligne par valeur recue est une invitation a faire
 * enfler la table, et le stockage Neon se paie au gigaoctet-mois.
 *
 * Passe trois cents provenances distinctes dans la journee — on en compte une
 * dizaine en temps normal — les nouvelles sont rangees sous « autre ». Les
 * provenances deja connues continuent de se compter normalement : une attaque
 * ne fait donc pas perdre la mesure reelle, elle cesse seulement de pouvoir
 * creer des lignes.
 *
 * Le compte est relu au plus une fois par minute : sans ce cache, la garde
 * elle-meme couterait une requete par signal.
 */
let gardeSources = { jour: null, distinctes: 0, lu: 0 };
const SOURCES_MAX_PAR_JOUR = 300;

async function sourceAcceptable(source) {
  if (source === "direct" || source === "interne" || source === "autre") return source;

  const jour = new Date().toISOString().slice(0, 10);
  if (gardeSources.jour !== jour || Date.now() - gardeSources.lu > 60_000) {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM audience_evenements
          WHERE jour = (NOW() AT TIME ZONE 'UTC')::date AND evenement = 'source'`
      );
      gardeSources = { jour, distinctes: rows[0]?.n || 0, lu: Date.now() };
    } catch {
      /* Si le compte est illisible on laisse passer : perdre la mesure serait
         pire que le risque qu'on cherche a borner. */
      gardeSources = { jour, distinctes: 0, lu: Date.now() };
    }
  }

  if (gardeSources.distinctes < SOURCES_MAX_PAR_JOUR) return source;

  /* Deja connue aujourd'hui : elle ne cree pas de ligne, donc elle passe. */
  try {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM audience_evenements
        WHERE jour = (NOW() AT TIME ZONE 'UTC')::date
          AND evenement = 'source' AND valeur = $1 LIMIT 1`,
      [source]
    );
    if (rowCount) return source;
  } catch {
    /* ignore : on retombe sur « autre » */
  }
  return "autre";
}

/**
 * Lire un signal recu, et n'en garder que ce qui est reconnu.
 * Renvoie null quand il n'y a rien d'exploitable : l'appelant repond alors
 * « recu » tout de meme, sans rien ecrire.
 */
function lireSignal(corps) {
  const espace = espaceValide(corps?.espace);
  const cle = cleValide(corps?.visite);
  if (!espace || !cle) return null;

  /* « unique » distingue deux natures de mesure, et s'y tromper fausse les
     chiffres dans les deux sens.

     Une section atteinte est un fait : le visiteur y est arrive. L'annoncer
     deux fois dans le meme signal ne veut rien dire de plus, donc on dedoublonne
     — sans quoi un defilement en va-et-vient ferait « 300 % des visites ont
     atteint le pied de page ».

     Un clic est un geste : cliquer deux fois sur le meme bouton, c'est deux
     clics, et l'ecran annonce un nombre de clics. Dedoublonner ici perdrait
     une information reelle. */
  const listeNettoyee = (valeurs, autorisees, { unique }) => {
    if (!Array.isArray(valeurs)) return [];
    const gardees = [];
    const vues = new Set();
    for (const v of valeurs.slice(0, 16)) {
      const s = String(v || "").trim().toLowerCase().slice(0, 40);
      if (!autorisees.includes(s)) continue;
      if (unique) {
        if (vues.has(s)) continue;
        vues.add(s);
      }
      gardees.push(s);
    }
    return gardees;
  };

  return {
    cle,
    espace,
    /* « debut » n'est pas dans le signal : c'est l'heure du serveur a la
       premiere ecriture. Une horloge de navigateur peut etre fausse de
       plusieurs jours, et une visite datee de 2019 polluerait la serie sans
       que rien ne l'explique. */
    secondes: entierBorne(corps?.secondes, 0, SECONDES_MAX_PAR_SIGNAL),
    vues: entierBorne(corps?.vues, 0, 5),
    premiere: corps?.premiere_du_jour === true,
    nouveau: corps?.nouveau === true,
    debutant: corps?.debut === true,
    source: normaliserSource(corps?.source),
    appareil: APPAREILS.includes(String(corps?.appareil || "").toLowerCase())
      ? String(corps.appareil).toLowerCase()
      : null,
    sections:
      espace === "accueil"
        ? listeNettoyee(corps?.sections, EVENEMENTS.section, { unique: true })
        : [],
    clics:
      espace === "accueil"
        ? listeNettoyee(corps?.clics, EVENEMENTS.clic, { unique: false })
        : [],
  };
}

/* ===== ÉCRITURE ===== */

/**
 * Compter des evenements nommes. Les paires identiques sont additionnees avant
 * l'envoi : Postgres refuse de modifier deux fois la meme ligne dans un seul
 * INSERT ... ON CONFLICT, et un battement de coeur peut tres bien porter deux
 * fois le meme clic.
 */
async function compterEvenements(espace, paires) {
  if (!paires.length) return;

  const cumul = new Map();
  for (const [evenement, valeur, nombre = 1] of paires) {
    const cle = `${evenement}\u0000${valeur}`;
    cumul.set(cle, (cumul.get(cle) || 0) + nombre);
  }

  const evenements = [];
  const valeurs = [];
  const nombres = [];
  for (const [cle, nombre] of cumul) {
    const [e, v] = cle.split("\u0000");
    evenements.push(e);
    valeurs.push(v);
    nombres.push(nombre);
  }

  await pool.query(
    `INSERT INTO audience_evenements (jour, espace, evenement, valeur, nombre)
     SELECT (NOW() AT TIME ZONE 'UTC')::date, $1, x.e, x.v, x.n
       FROM UNNEST($2::text[], $3::text[], $4::int[]) AS x(e, v, n)
     ON CONFLICT (jour, espace, evenement, valeur) DO UPDATE
        SET nombre = audience_evenements.nombre + EXCLUDED.nombre`,
    [espace, evenements, valeurs, nombres]
  );
}

/**
 * Compter un evenement cote serveur, sans jamais faire echouer l'appel qui
 * l'entoure. Une mesure d'audience ne doit pas pouvoir empecher un beneficiaire
 * de telecharger son attestation : si l'ecriture rate, on le note et on
 * continue.
 */
function noter(espace, evenement, valeur = "") {
  const e = espaceValide(espace);
  if (!e || !EVENEMENTS[evenement]) return;
  const v = EVENEMENTS[evenement].includes(String(valeur)) ? String(valeur) : "";
  compterEvenements(e, [[evenement, v]]).catch((err) =>
    console.warn("[AUDIENCE] evenement non compte :", err.message)
  );
}

/** Enregistrer un signal valide. */
async function enregistrerSignal(s) {
  const source = s.debutant ? await sourceAcceptable(s.source) : null;

  /* La garde « WHERE espace = » evite qu'une cle reutilisee d'un perimetre a
     l'autre melange deux mesures. Si elle ne passe pas, rien n'est ecrit — et
     c'est la bonne issue. */
  await pool.query(
    `INSERT INTO audience_visites
         (cle, espace, debut, fin, secondes, vues, premiere_du_jour, nouveau, source, appareil)
     VALUES ($1, $2, NOW(), NOW(), $3, $4, $5, $6, $7, $8)
     ON CONFLICT (cle) DO UPDATE
        SET fin      = NOW(),
            secondes = LEAST(audience_visites.secondes + EXCLUDED.secondes, 86400),
            vues     = LEAST(audience_visites.vues + EXCLUDED.vues, 1000)
      WHERE audience_visites.espace = EXCLUDED.espace`,
    [s.cle, s.espace, s.secondes, s.vues, s.premiere, s.nouveau, source, s.appareil]
  );

  const paires = [
    ...s.sections.map((v) => ["section", v]),
    ...s.clics.map((v) => ["clic", v]),
  ];
  /* Provenance et appareil ne sont comptes qu'a l'ouverture de la visite :
     sinon chaque battement de coeur les recompterait. */
  if (s.debutant) {
    paires.push(["source", source]);
    if (s.appareil) paires.push(["appareil", s.appareil]);
  }
  if (paires.length) await compterEvenements(s.espace, paires);
}

/* ===== LECTURE =====
 *
 * Les journees recentes se lisent dans le detail des visites, les anciennes
 * dans les compteurs journaliers. La frontiere est posee une journee en deca de
 * la retention, pour qu'aucune journee ne tombe entre les deux au moment ou la
 * purge passe.
 */
const JOUR_FRONTIERE = `(NOW() AT TIME ZONE 'UTC')::date - ${RETENTION_JOURS - 1}`;

function jourValide(v, defaut) {
  const s = String(v || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : defaut;
}

function bornesPeriode(query) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const jours = Math.min(730, Math.max(1, Math.trunc(Number(query?.jours)) || 30));
  const defautDu = new Date(Date.now() - (jours - 1) * 86400_000).toISOString().slice(0, 10);

  let du = jourValide(query?.du, defautDu);
  let au = jourValide(query?.au, aujourdhui);
  if (du > au) [du, au] = [au, du];
  return { du, au };
}

/**
 * La serie journaliere, assemblee des deux sources.
 *
 * Le detail l'emporte sur le resume pour une meme journee : les deux ne se
 * chevauchent qu'au moment de la frontiere, et le detail est toujours le plus
 * juste des deux.
 */
async function serieJournaliere(du, au) {
  const { rows } = await pool.query(
    `WITH detail AS (
       SELECT (debut AT TIME ZONE 'UTC')::date AS jour,
              espace,
              COUNT(*)::int                                  AS visites,
              COUNT(*) FILTER (WHERE premiere_du_jour)::int   AS visiteurs,
              COUNT(*) FILTER (WHERE nouveau)::int            AS nouveaux,
              SUM(vues)::int                                  AS vues,
              SUM(secondes)::bigint                           AS secondes,
              COUNT(*) FILTER (WHERE secondes < 10)::int      AS eclairs
         FROM audience_visites
        WHERE (debut AT TIME ZONE 'UTC')::date BETWEEN GREATEST($1::date, ${JOUR_FRONTIERE}) AND $2::date
        GROUP BY 1, 2
     ),
     resume AS (
       SELECT jour, espace, visites, visiteurs, nouveaux, vues, secondes, eclairs
         FROM audience_jours
        WHERE jour BETWEEN $1::date AND LEAST($2::date, ${JOUR_FRONTIERE} - 1)
     )
     SELECT * FROM detail
     UNION ALL
     SELECT * FROM resume
     ORDER BY jour, espace`,
    [du, au]
  );

  return rows.map((r) => ({
    jour: r.jour instanceof Date ? r.jour.toISOString().slice(0, 10) : String(r.jour),
    espace: r.espace,
    visites: Number(r.visites),
    visiteurs: Number(r.visiteurs),
    nouveaux: Number(r.nouveaux),
    vues: Number(r.vues),
    secondes: Number(r.secondes),
    eclairs: Number(r.eclairs),
  }));
}

async function evenementsPeriode(du, au) {
  const { rows } = await pool.query(
    `SELECT espace, evenement, valeur, SUM(nombre)::int AS nombre
       FROM audience_evenements
      WHERE jour BETWEEN $1::date AND $2::date
      GROUP BY espace, evenement, valeur
      ORDER BY nombre DESC, valeur`,
    [du, au]
  );
  return rows;
}

function cumuler(lignes) {
  const t = {
    visites: 0, visiteurs: 0, nouveaux: 0, vues: 0, secondes: 0, eclairs: 0,
  };
  for (const l of lignes) {
    t.visites += l.visites;
    t.visiteurs += l.visiteurs;
    t.nouveaux += l.nouveaux;
    t.vues += l.vues;
    t.secondes += l.secondes;
    t.eclairs += l.eclairs;
  }
  /* La duree moyenne porte sur les visites, pas sur les visiteurs : c'est la
     question qu'on pose — combien de temps dure un passage. */
  t.minutes = Math.round(t.secondes / 60);
  t.duree_moyenne = t.visites ? Math.round(t.secondes / t.visites) : 0;
  t.part_eclairs = t.visites ? Math.round((t.eclairs / t.visites) * 100) : 0;
  return t;
}

/** La synthese complete, telle que la page la consomme. */
async function synthese(query) {
  const { du, au } = bornesPeriode(query);

  const [serie, evenements] = await Promise.all([
    serieJournaliere(du, au),
    evenementsPeriode(du, au),
  ]);

  const liste = (espace, evenement, ordre = null) => {
    /* « espace: null » additionne les deux perimetres. « Par ou arrivent-ils »
       et « avec quel appareil » sont la meme question des deux cotes : deux
       listes separees obligeraient a faire l'addition de tete. */
    const cumulees = new Map();
    for (const e of evenements) {
      if (e.evenement !== evenement) continue;
      if (espace && e.espace !== espace) continue;
      cumulees.set(e.valeur, (cumulees.get(e.valeur) || 0) + Number(e.nombre));
    }
    const trouvees = [...cumulees].map(([valeur, nombre]) => ({ valeur, nombre }));
    if (!ordre) return trouvees.sort((a, b) => b.nombre - a.nombre || a.valeur.localeCompare(b.valeur));
    /* Les sections suivent l'ordre de la page, pas celui des nombres : leur
       interet est de montrer ou le visiteur s'arrete, ce qu'un classement par
       frequence rendrait illisible. */
    return ordre.map((v) => ({
      valeur: v,
      nombre: trouvees.find((t) => t.valeur === v)?.nombre || 0,
    }));
  };

  const compte = (espace, evenement) =>
    evenements
      .filter((e) => e.espace === espace && e.evenement === evenement)
      .reduce((n, e) => n + Number(e.nombre), 0);

  const parEspace = {};
  for (const espace of ESPACES) {
    parEspace[espace] = cumuler(serie.filter((l) => l.espace === espace));
  }

  return {
    periode: { du, au, retention: RETENTION_JOURS },
    total: cumuler(serie),
    par_espace: parEspace,
    par_jour: serie,
    sources: liste(null, "source"),
    appareils: liste(null, "appareil"),
    sections: liste("accueil", "section", EVENEMENTS.section),
    clics: liste("accueil", "clic"),
    /* Le parcours de l'espace, dans l'ordre ou il se vit. Les quatre nombres
       viennent du serveur : ils ne dependent d'aucun navigateur. */
    parcours: [
      { etape: "Lien demandé", nombre: compte("espace", "lien_demande") },
      { etape: "Lien envoyé", nombre: compte("espace", "lien_envoye") },
      { etape: "Espace ouvert", nombre: compte("espace", "session_ouverte") },
      { etape: "Attestation téléchargée", nombre: compte("espace", "attestation") },
    ],
  };
}

module.exports = {
  EVENEMENTS,
  ESPACES,
  lireSignal,
  enregistrerSignal,
  noter,
  synthese,
  normaliserSource,
  bornesPeriode,
  cumuler,
};
