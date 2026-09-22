const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const { prenomSansNomRepete, repetitionsDans, clePersonne } = require("../services/nomsDoublons");
const { trierAdresses } = require("../services/adressesValides");
const { classerParAssiduite } = require("../services/assiduite");

const router = express.Router();

const PAGE_SIZE = 100;

/* Taille des lots ecrits dans la reponse lors de l'export. Le fichier est
   envoye au fil de l'eau plutot que construit entierement en memoire :
   une base de plusieurs dizaines de milliers de lignes ne doit pas faire
   gonfler le processus. */
const EXPORT_BATCH = 2000;

/* Filtres et cloisonnement, partages par la liste paginee et l'export.
   Les deux vues doivent voir exactement le meme perimetre : un partenaire
   n'exporte que ses propres participants, un coach que les siens. */
function buildFilters(req) {
  const search = (req.query.search || "").trim();
  const genre = req.query.genre || "";

  const conditions = [];
  const params = [];
  let idx = 1;

  if (req.user.role === "partner") {
    conditions.push(`a.partner_id = $${idx++}`);
    params.push(req.user.partner_id);
  } else if (req.user.role === "coach") {
    conditions.push(`a.coach_id = $${idx++}`);
    params.push(req.user.id);
  }

  if (genre) {
    conditions.push(`p.genre = $${idx++}`);
    params.push(genre);
  }

  if (search) {
    conditions.push(`(
      p.nom       ILIKE $${idx} OR p.prenom    ILIKE $${idx} OR
      p.structure ILIKE $${idx} OR a.title     ILIKE $${idx} OR
      pr.name     ILIKE $${idx} OR d.name      ILIKE $${idx}
    )`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const baseFrom = `
    FROM participants p
    JOIN activity_participants ap ON ap.participant_id = p.id
    JOIN activities a ON a.id = ap.activity_id
    LEFT JOIN partners pr ON pr.id = a.partner_id
    LEFT JOIN devices   d  ON d.id  = a.device_id
    ${where}
  `;

  return { baseFrom, params, nextIdx: idx, search, genre };
}

/* ===== GET PARTICIPANTS (pagine, filtre cote serveur) ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const { baseFrom, params, nextIdx } = buildFilters(req);

    const [statsRes, dataRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                     AS total,
          COUNT(*) FILTER (WHERE p.genre = 'H')::int       AS male,
          COUNT(*) FILTER (WHERE p.genre = 'F')::int       AS female
        ${baseFrom}
      `, params),
      pool.query(`
        SELECT
          p.*,
          a.id            AS activity_id,
          a.title         AS activite,
          a.activity_date AS date_activite,
          pr.name         AS partenaire,
          d.name          AS dispositif
        ${baseFrom}
        ORDER BY a.activity_date DESC, p.nom, p.prenom
        LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
      `, [...params, PAGE_SIZE, offset]),
    ]);

    const { total, male, female } = statsRes.rows[0];
    res.json({
      rows:  dataRes.rows,
      total,
      male,
      female,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      limit: PAGE_SIZE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== EXPORT CSV =====
   L'export du navigateur ne portait que sur la page affichee : au-dela de
   100 lignes, le fichier etait silencieusement incomplet. Il est desormais
   produit ici, sur l'ensemble des lignes correspondant aux filtres en cours. */

const CSV_HEADERS = [
  "Nom", "Prénom", "Structure/Établissement", "Genre", "Tranche d'âge",
  "Email", "Téléphone", "Statut", "Activité", "Date activité",
  "Partenaire", "Dispositif",
];

function csvCell(value) {
  if (value == null) return "";
  let text = String(value);
  /* Une cellule commencant par =, +, - ou @ est interpretee comme une formule
     par Excel : on la neutralise en la prefixant d'une apostrophe. */
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  text = text.replace(/"/g, '""');
  return /[;"\n\r]/.test(text) ? `"${text}"` : text;
}

function csvLine(cells) {
  return cells.map(csvCell).join(";");
}

router.get("/export.csv", authMiddleware, async (req, res) => {
  try {
    const { baseFrom, params, nextIdx, search, genre } = buildFilters(req);

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, params);
    const total = countRes.rows[0].total;

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="participants-odc-${stamp}.csv"`);
    /* Le nombre total permet a l'interface de confirmer ce qui a ete telecharge. */
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Content-Disposition");

    /* BOM : sans lui, Excel lit le fichier en ANSI et casse les accents. */
    res.write("﻿");
    res.write(csvLine(CSV_HEADERS) + "\r\n");

    for (let offset = 0; offset < total; offset += EXPORT_BATCH) {
      const batch = await pool.query(`
        SELECT p.nom, p.prenom, p.structure, p.genre, p.age_range,
               p.email, p.telephone, p.statut,
               a.title AS activite,
               to_char(a.activity_date, 'YYYY-MM-DD') AS date_activite,
               pr.name AS partenaire,
               d.name  AS dispositif
        ${baseFrom}
        ORDER BY a.activity_date DESC, p.nom, p.prenom
        LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
      `, [...params, EXPORT_BATCH, offset]);

      for (const r of batch.rows) {
        res.write(
          csvLine([
            r.nom, r.prenom, r.structure, r.genre, r.age_range,
            r.email, r.telephone, r.statut, r.activite, r.date_activite,
            r.partenaire, r.dispositif,
          ]) + "\r\n"
        );
      }
    }

    res.end();

    /* Un export de donnees personnelles en masse merite d'etre trace. */
    logAudit(req, "EXPORT", "participants", null, `${total} participant(s)`, {
      total,
      filtres: { recherche: search || null, genre: genre || null },
    });
  } catch (err) {
    console.error("[EXPORT PARTICIPANTS]", err);
    /* Si l'ecriture a commence, les en-tetes sont deja partis : on ne peut
       plus renvoyer un JSON d'erreur, on coupe le flux. */
    if (res.headersSent) return res.end();
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ASSIDUITE =====
 *
 * Combien de modules une personne a suivis, et lesquels. Le classement met en
 * tete les plus assidus : ce sont eux que l'on veut reconnaitre, relancer ou
 * orienter vers la suite du parcours.
 *
 * Le rapprochement des fiches vit dans son propre service, qui l'explique et
 * que l'on peut eprouver a part. Ici, on se contente de lire le perimetre de
 * l'utilisateur et de le lui passer.
 */
router.get("/assiduite", authMiddleware, async (req, res) => {
  try {
    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.email, p.telephone, p.genre, p.structure,
              a.id AS activity_id, a.title AS titre,
              to_char(a.activity_date, 'YYYY-MM-DD') AS date,
              d.name AS dispositif
       ${baseFrom}
       ORDER BY p.id`,
      params
    );

    const classement = classerParAssiduite(r.rows);
    res.json({
      personnes: classement.length,
      /* Ce que l'on regarde en premier : combien reviennent. Une personne qui
         n'est venue qu'une fois n'est pas un parcours, c'est un passage. */
      fideles: classement.filter((x) => x.total_modules > 1).length,
      homonymes: classement.filter((x) => x.homonymes).length,
      classement,
    });
  } catch (err) {
    console.error("[ASSIDUITE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Le meme classement en CSV. L'ecran montre les premiers ; un bilan se fait
   dans un tableur, avec les modules de chacun sur la ligne. */
router.get("/assiduite/export.csv", authMiddleware, async (req, res) => {
  try {
    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.email, p.telephone, p.genre, p.structure,
              a.id AS activity_id, a.title AS titre,
              to_char(a.activity_date, 'YYYY-MM-DD') AS date,
              d.name AS dispositif
       ${baseFrom}
       ORDER BY p.id`,
      params
    );
    const classement = classerParAssiduite(r.rows);

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="assiduite-odc-${stamp}.csv"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.write("\ufeff");
    res.write(csvLine([
      "Rang", "Nom", "Prénom", "Modules suivis", "Email", "Téléphone",
      "Genre", "Structure", "Homonyme possible", "Modules",
    ]) + "\r\n");

    classement.forEach((x, i) => {
      res.write(csvLine([
        i + 1, x.nom, x.prenom, x.total_modules, x.email, x.telephone,
        x.genre, x.structure, x.homonymes ? "oui" : "",
        x.modules.map((m) => `${m.titre}${m.date ? ` (${m.date})` : ""}`).join(" | "),
      ]) + "\r\n");
    });
    res.end();

    logAudit(req, "EXPORT", "participants", null, `assiduité — ${classement.length} personne(s)`, {
      personnes: classement.length,
    });
  } catch (err) {
    console.error("[EXPORT ASSIDUITE]", err);
    if (res.headersSent) return res.end();
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== NOMS DE FAMILLE ECRITS DEUX FOIS =====
   Les imports deja effectues portent la meme repetition que les nouveaux. La
   detection ne peut pas se faire en SQL — elle compare des mots en ignorant
   casse et accents — alors on la fait ici, sur les seules colonnes utiles. */
router.get("/doublons-nom", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    /* Le cloisonnement des roles s'applique : un partenaire ne voit, et ne
       corrige, que les participants de ses propres activites. */
    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email ${baseFrom} ORDER BY p.nom, p.prenom`,
      params
    );

    const trouves = repetitionsDans(r.rows).map(({ ligne, propose }) => ({
      id: ligne.id,
      nom: ligne.nom,
      prenom: ligne.prenom,
      email: ligne.email,
      prenom_corrige: propose,
    }));

    res.json({ total: trouves.length, participants: trouves });
  } catch (err) {
    console.error("[DOUBLONS NOM]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* La correction s'applique aux identifiants transmis, jamais « a tout ce qui
   correspond » : l'appelant a vu la liste, il corrige ce qu'il a vu. Entre
   l'affichage et le clic, la base a pu changer — on reverifie donc chaque
   ligne avant de la toucher. */
router.post("/doublons-nom/corriger", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "Aucun participant à corriger." });
    if (ids.length > 1000) return res.status(400).json({ error: "Trop de participants en une fois." });

    /* On relit le perimetre autorise exactement comme la liste l'a construit,
       puis on ne garde que les identifiants demandes. Greffer un « AND » sur
       baseFrom serait plus court, mais cette clause n'a pas toujours de WHERE
       devant elle — un administrateur sans filtre n'en produit aucun — et la
       requete deviendrait invalide selon l'appelant. */
    const { baseFrom, params } = buildFilters(req);
    const portee = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom ${baseFrom}`,
      params
    );
    const demandes = new Set(ids);
    const lignes = portee.rows.filter((x) => demandes.has(x.id));

    let corriges = 0;
    const ignores = [];
    for (const ligne of lignes) {
      const propose = prenomSansNomRepete(ligne.prenom, ligne.nom);
      if (!propose) {
        ignores.push(ligne.id);
        continue;
      }
      await pool.query("UPDATE participants SET prenom = $1 WHERE id = $2", [propose, ligne.id]);
      logAudit(req, "UPDATE", "participants", ligne.id, `${propose} ${ligne.nom}`, {
        avant: `${ligne.prenom} ${ligne.nom}`,
        apres: `${propose} ${ligne.nom}`,
        motif: "nom de famille écrit deux fois",
      });
      corriges += 1;
    }

    res.json({ corriges, ignores: ignores.length });
  } catch (err) {
    console.error("[DOUBLONS NOM CORRIGER]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== FICHES DE LA MEME PERSONNE =====
   Une personne suit plusieurs formations et figure sur autant de listes de
   presence. Ces listes ne portent pas les memes colonnes : l'une a les
   adresses, l'autre les telephones, une troisieme le genre et la structure.
   L'ancien import rapprochait les noms par egalite stricte et ne completait
   jamais une fiche existante : chaque liste creait donc une fiche de plus, et
   l'information d'une meme personne finissait eparpillee entre plusieurs
   fiches dont aucune n'etait complete.

   L'import ne les fabrique plus et complete ce qu'il reconnait. Restent celles
   d'avant, qu'il faut reunir : une seule fiche par personne, portant tout ce
   que les listes ont apporte, et inscrite a chacune de ses formations. */

const CHAMPS_FICHE = ["email", "telephone", "genre", "age_range", "statut", "structure"];

const LIBELLES_CHAMPS = {
  email: "email",
  telephone: "téléphone",
  genre: "genre",
  age_range: "tranche d'âge",
  statut: "statut",
  structure: "structure",
};

/* Deux ecritures d'une meme valeur ne sont pas un desaccord : « UCAD » et
   « ucad » designent la meme structure, « Foo@X.com » et « foo@x.com » la meme
   boite. On compare donc des formes normalisees. */
function valeurNormalisee(champ, valeur) {
  if (valeur === null || valeur === undefined || String(valeur).trim() === "") return null;
  const v = String(valeur).trim();
  return champ === "telephone" ? v.replace(/\s+/g, "") : v.toLowerCase();
}

function renseignes(fiche) {
  return CHAMPS_FICHE.filter((c) => valeurNormalisee(c, fiche[c]) !== null).length;
}

function analyserGroupes(fiches) {
  const parCle = new Map();
  for (const f of fiches) {
    const cle = clePersonne(f.nom, f.prenom);
    if (!cle) continue;
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(f);
  }

  const resultat = [];
  for (const membres of parCle.values()) {
    if (membres.length < 2) continue;

    /* La fiche conservee est la mieux renseignee — c'est celle qui a le moins
       a recevoir, donc celle dont le moins de valeurs seront ecartees. A
       egalite, la plus ancienne : son identifiant circule deja ailleurs. */
    const garder = [...membres].sort(
      (a, b) => renseignes(b) - renseignes(a) || a.id - b.id
    )[0];
    const absorber = membres.filter((f) => f.id !== garder.id);

    /* Ce que la fusion ajouterait a la fiche conservee, et ce sur quoi les
       fiches se contredisent. Un desaccord n'est pas forcement une erreur —
       une personne peut avoir change d'adresse — mais il se tranche a l'oeil,
       pas par une regle. */
    const apport = [];
    const conflits = [];
    for (const champ of CHAMPS_FICHE) {
      const valeurs = new Map(); // valeur normalisee → valeur affichable
      for (const f of membres) {
        const n = valeurNormalisee(champ, f[champ]);
        if (n !== null && !valeurs.has(n)) valeurs.set(n, String(f[champ]).trim());
      }
      if (valeurs.size === 0) continue;

      const surGarder = valeurNormalisee(champ, garder[champ]);
      if (valeurs.size > 1) {
        conflits.push({
          champ,
          libelle: LIBELLES_CHAMPS[champ],
          conserve: surGarder === null ? null : garder[champ],
          ecartees: [...valeurs.entries()].filter(([n]) => n !== surGarder).map(([, v]) => v),
        });
      } else if (surGarder === null) {
        const [, affichable] = [...valeurs.entries()][0];
        apport.push({ champ, libelle: LIBELLES_CHAMPS[champ], valeur: affichable });
      }
    }

    resultat.push({ garder, absorber, apport, conflits });
  }

  /* Les groupes qui apportent quelque chose d'abord : ce sont ceux qui
     completent une fiche, donc ceux qui valent la peine d'etre regardes. */
  resultat.sort((a, b) => b.apport.length - a.apport.length || a.garder.id - b.garder.id);
  return resultat;
}

/**
 * Les formations de chaque fiche.
 *
 * C'est la preuve qui manquait pour decider. Le rapprochement se fait sur le
 * nom, et le nom ne distingue pas deux homonymes : on demandait donc de
 * trancher « meme personne ou non ? » sans montrer ce qui permet de repondre.
 * Deux fiches sur deux formations differentes, c'est une personne qui est
 * revenue. Deux fiches sur la meme formation, c'est un doublon d'import — ou
 * deux personnes qui portent le meme nom, et il faut alors regarder de pres.
 *
 * Une seule requete pour tout le panneau : une par fiche en ferait des
 * centaines sur une base un peu fournie.
 */
const MAX_ACTIVITES_AFFICHEES = 8;

async function attacherActivites(groupes) {
  const fiches = groupes.flatMap((g) => [g.garder, ...g.absorber]);
  if (!fiches.length) return;

  const { rows } = await pool.query(
    `SELECT ap.participant_id, a.id, a.title, a.activity_date
       FROM activity_participants ap
       JOIN activities a ON a.id = ap.activity_id
      WHERE ap.participant_id = ANY($1::int[])
      ORDER BY a.activity_date DESC NULLS LAST, a.id DESC`,
    [fiches.map((f) => f.id)]
  );

  const parFiche = new Map();
  for (const r of rows) {
    if (!parFiche.has(r.participant_id)) parFiche.set(r.participant_id, []);
    parFiche.get(r.participant_id).push({ id: r.id, titre: r.title, date: r.activity_date });
  }

  for (const f of fiches) {
    const liste = parFiche.get(f.id) || [];
    f.activites = liste.slice(0, MAX_ACTIVITES_AFFICHEES);
    /* Le total sert a dire « et 3 autres » plutot que de tout deverser. */
    f.activites_total = liste.length;
  }

  /* Deux fiches inscrites a la meme formation ne s'expliquent pas par une
     personne revenue : c'est soit un doublon d'import, soit deux homonymes.
     Dans les deux cas, la ligne merite d'etre regardee avant d'etre validee. */
  for (const g of groupes) {
    const vues = new Set();
    g.activite_partagee = false;
    for (const f of [g.garder, ...g.absorber]) {
      for (const a of parFiche.get(f.id) || []) {
        if (vues.has(a.id)) { g.activite_partagee = true; break; }
        vues.add(a.id);
      }
      if (g.activite_partagee) break;
    }
  }
}

router.get("/fiches-doublons", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone,
              p.genre, p.age_range, p.statut, p.structure ${baseFrom}
       ORDER BY p.id`,
      params
    );

    const groupes = analyserGroupes(r.rows);
    await attacherActivites(groupes);
    res.json({
      /* Le nombre de fiches en trop, pas le nombre de groupes : c'est ce qui
         disparaitra des listes et des compteurs. */
      total: groupes.reduce((n, g) => n + g.absorber.length, 0),
      personnes: groupes.length,
      a_completer: groupes.filter((g) => g.apport.length > 0).length,
      avec_conflit: groupes.filter((g) => g.conflits.length > 0).length,
      /* Les groupes ou deux fiches figurent sur la meme formation : ceux-la
         ne s'expliquent pas par une personne revenue. */
      avec_activite_partagee: groupes.filter((g) => g.activite_partagee).length,
      /* Ce que le bandeau annonce : les groupes qui partent decoches, quelle
         que soit la raison. Additionner les deux compteurs precedents
         surestimerait un groupe qui cumule les deux motifs ; en prendre le
         plus grand le sous-estimerait des qu'ils portent sur des groupes
         differents — ce qui est le cas courant. */
      a_regarder: groupes.filter((g) => g.conflits.length > 0 || g.activite_partagee).length,
      groupes,
    });
  } catch (err) {
    console.error("[FICHES DOUBLONS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== COMPLETER LES FICHES D'UNE MEME PERSONNE =====
 *
 * Une version precedente reunissait les fiches : elle transferait les
 * presences puis supprimait la fiche absorbee. C'etait une erreur de
 * conception, et elle s'est vue sur le terrain — le nombre de beneficiaires de
 * certaines activites a baisse.
 *
 * Le mecanisme : quand deux fiches d'une meme personne figuraient sur la meme
 * activite, la fusion n'en laissait qu'une ligne. Le compte de cette activite
 * perdait une unite. Et si le rapprochement etait faux — deux homonymes — un
 * vrai beneficiaire disparaissait d'une liste de presence.
 *
 * Le but n'a jamais ete de supprimer qui que ce soit. Il etait de completer :
 * une personne laisse son adresse sur une liste et son telephone sur une
 * autre ; chaque liste doit porter l'information complete.
 *
 * On ne supprime donc plus rien, et on ne deplace aucune presence. On remplit
 * les cases vides de CHAQUE fiche du groupe avec ce que les autres portent.
 * Les listes de presence gardent exactement les memes lignes ; seules les
 * cases vides se remplissent. Les comptes ne peuvent pas bouger.
 */
router.post("/fiches-doublons/completer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "Aucun groupe à compléter." });
    if (ids.length > 1000) return res.status(400).json({ error: "Trop de fiches en une fois." });

    const { baseFrom, params } = buildFilters(req);
    const portee = await client.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone,
              p.genre, p.age_range, p.statut, p.structure ${baseFrom} ORDER BY p.id`,
      params
    );

    /* Les groupes se recalculent sur l'etat courant. L'appelant designe les
       fiches du groupe ; on complete le groupe entier, pas une fiche isolee. */
    const demandes = new Set(ids);
    const groupesRetenus = analyserGroupes(portee.rows).filter((g) =>
      g.absorber.some((f) => demandes.has(f.id)) || demandes.has(g.garder.id)
    );

    await client.query("BEGIN");
    ouverte = true;

    let fichesCompletees = 0;
    let champsRemplis = 0;
    const detail = [];

    for (const groupe of groupesRetenus) {
      const membres = [groupe.garder, ...groupe.absorber];

      /* La valeur retenue pour chaque champ : la seule connue du groupe. S'il
         y en a plusieurs qui different, on ne tranche pas — un desaccord se
         regarde, il ne se resout pas par une regle. La ligne est de toute
         facon decochee par defaut dans l'interface. */
      const valeurs = {};
      for (const champ of CHAMPS_FICHE) {
        const connues = new Map();
        for (const f of membres) {
          const n = valeurNormalisee(champ, f[champ]);
          if (n !== null && !connues.has(n)) connues.set(n, String(f[champ]).trim());
        }
        if (connues.size === 1) valeurs[champ] = [...connues.values()][0];
      }

      const aEcrire = Object.keys(valeurs);
      if (!aEcrire.length) continue;

      for (const f of membres) {
        /* Seules les cases vides se remplissent : COALESCE n'ecrase rien de
           renseigne. Une fiche deja complete n'est pas touchee. */
        const manquants = aEcrire.filter((c) => valeurNormalisee(c, f[c]) === null);
        if (!manquants.length) continue;

        await client.query(
          `UPDATE participants SET ${manquants.map((c, i) => `${c} = COALESCE(${c}, $${i + 2})`).join(", ")}
            WHERE id = $1`,
          [f.id, ...manquants.map((c) => valeurs[c])]
        );
        fichesCompletees += 1;
        champsRemplis += manquants.length;
        detail.push({ fiche: f.id, nom: `${f.prenom} ${f.nom}`, champs: manquants });
      }
    }

    await client.query("COMMIT");
    ouverte = false;

    if (detail.length) {
      logAudit(req, "UPDATE", "participants", null,
        `${fichesCompletees} fiche(s) complétée(s)`, { champs_remplis: champsRemplis, detail });
    }

    res.json({
      fiches_completees: fichesCompletees,
      champs_remplis: champsRemplis,
      groupes: groupesRetenus.length,
    });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[FICHES DOUBLONS COMPLETION]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* ===== FICHES SUPPRIMEES PAR L'ANCIENNE REUNION =====
 *
 * L'ancienne version supprimait la fiche absorbee. Le journal d'audit a
 * conserve ce qu'elle portait et les activites auxquelles elle etait inscrite
 * — c'est ce qui rend la remise en place possible.
 *
 * On ne restaure rien d'office : certaines reunions etaient justes, et
 * recreer une vraie ligne en double regonflerait un compte a tort. On montre
 * ce qui a ete supprime, avec ses activites, et l'utilisateur choisit.
 */
router.get("/fiches-absorbees", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const r = await pool.query(
      `SELECT id, resource_id, resource_label, details, created_at
         FROM audit_logs
        WHERE resource = 'participants' AND action = 'DELETE'
          AND details->>'fusionnee_avec' IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 500`
    );

    /* Une fiche deja remise en place ne doit plus etre proposee. On la
       reconnait a une trace de restauration portant le meme journal. */
    const { rows: faites } = await pool.query(
      `SELECT details->>'depuis_journal' AS journal
         FROM audit_logs
        WHERE resource = 'participants' AND action = 'CREATE'
          AND details->>'depuis_journal' IS NOT NULL`
    );
    const restaurees = new Set(faites.map((f) => Number(f.journal)));

    const lignes = [];
    for (const l of r.rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      const f = d.fiche_absorbee;
      if (!f) continue;
      lignes.push({
        journal: l.id,
        supprimee_le: l.created_at,
        ancien_id: l.resource_id,
        fusionnee_avec: d.fusionnee_avec ?? null,
        restauree: restaurees.has(l.id),
        fiche: {
          nom: f.nom || "", prenom: f.prenom || "",
          email: f.email || null, telephone: f.telephone || null,
          genre: f.genre || null, age_range: f.age_range || null,
          statut: f.statut || null, structure: f.structure || null,
        },
        activites: Array.isArray(f.activites) ? f.activites : [],
      });
    }

    /* Le titre des activites, pour que la decision se prenne sur un nom de
       formation et pas sur un numero. */
    const ids = [...new Set(lignes.flatMap((l) => l.activites))];
    let titres = new Map();
    if (ids.length) {
      const t = await pool.query(
        "SELECT id, title, to_char(activity_date,'YYYY-MM-DD') AS date FROM activities WHERE id = ANY($1::int[])",
        [ids]
      );
      titres = new Map(t.rows.map((x) => [x.id, x]));
    }
    for (const l of lignes) {
      l.activites = l.activites.map((id) => ({
        id,
        titre: titres.get(id)?.title || `Activité ${id}`,
        date: titres.get(id)?.date || null,
        existe: titres.has(id),
      }));
    }

    res.json({
      total: lignes.length,
      a_restaurer: lignes.filter((l) => !l.restauree).length,
      lignes,
    });
  } catch (err) {
    console.error("[FICHES ABSORBEES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Remettre en place les fiches choisies, avec leurs inscriptions. La nouvelle
   fiche porte un autre identifiant — l'ancien est perdu — mais les listes de
   presence retrouvent leur ligne, et c'est ce qui compte pour les comptes. */
router.post("/fiches-absorbees/restaurer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const journaux = Array.isArray(req.body?.journaux)
      ? req.body.journaux.map(Number).filter(Number.isInteger) : [];
    if (!journaux.length) return res.status(400).json({ error: "Aucune fiche à restaurer." });

    const r = await client.query(
      `SELECT id, details FROM audit_logs
        WHERE id = ANY($1::int[]) AND resource = 'participants' AND action = 'DELETE'`,
      [journaux]
    );

    await client.query("BEGIN");
    ouverte = true;

    let restaurees = 0;
    let inscriptions = 0;
    for (const l of r.rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      const f = d.fiche_absorbee;
      if (!f) continue;

      const { rows } = await client.query(
        `INSERT INTO participants (nom, prenom, email, telephone, genre, age_range, statut, structure)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [f.nom || "", f.prenom || "", f.email || null, f.telephone || null,
         f.genre || null, f.age_range || null, f.statut || null, f.structure || null]
      );
      const nouvelId = rows[0].id;

      for (const activityId of (Array.isArray(f.activites) ? f.activites : [])) {
        /* Une activite supprimee depuis ne peut pas recevoir l'inscription :
           on la passe plutot que de faire echouer la restauration entiere. */
        const ins = await client.query(
          `INSERT INTO activity_participants (activity_id, participant_id)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM activities WHERE id = $1)
           ON CONFLICT DO NOTHING`,
          [activityId, nouvelId]
        );
        inscriptions += ins.rowCount;
      }

      logAudit(req, "CREATE", "participants", nouvelId, `${f.prenom} ${f.nom}`, {
        motif: "fiche remise en place après une réunion",
        depuis_journal: l.id,
        ancien_id: d.fusionnee_avec ? String(d.fusionnee_avec) : null,
      });
      restaurees += 1;
    }

    await client.query("COMMIT");
    ouverte = false;
    res.json({ restaurees, inscriptions });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[RESTAURATION FICHES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

module.exports = router;
