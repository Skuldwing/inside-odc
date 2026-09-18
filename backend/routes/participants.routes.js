const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const { prenomSansNomRepete, repetitionsDans, clePersonne } = require("../services/nomsDoublons");

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

/* La fusion deplace les presences puis supprime la fiche vide. Elle est
   irreversible : on reverifie donc chaque cas au moment de l'appliquer, la
   base ayant pu changer depuis l'affichage de la liste. */
router.post("/fiches-doublons/fusionner", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "Aucune fiche à fusionner." });
    if (ids.length > 1000) return res.status(400).json({ error: "Trop de fiches en une fois." });

    const { baseFrom, params } = buildFilters(req);
    const portee = await client.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone,
              p.genre, p.age_range, p.statut, p.structure ${baseFrom} ORDER BY p.id`,
      params
    );

    /* Le groupe se recalcule ici, sur l'etat courant : l'appelant designe les
       fiches a absorber, jamais celle a conserver. Une fiche qui a recu une
       adresse entre-temps n'est plus un doublon et sort d'elle-meme. */
    const aAbsorber = new Map(); // id a supprimer → id a conserver
    for (const groupe of analyserGroupes(portee.rows)) {
      for (const fiche of groupe.absorber) {
        if (ids.includes(fiche.id)) aAbsorber.set(fiche.id, { garder: groupe.garder, fiche });
      }
    }

    await client.query("BEGIN");
    ouverte = true;

    let fusionnees = 0;
    for (const [id, { garder, fiche }] of aAbsorber) {
      /* Toute information portee par la fiche absorbee et absente de celle
         qu'on conserve lui est reprise — y compris l'email et le telephone,
         qui sont justement ce qu'une liste apporte quand une autre ne l'avait
         pas. COALESCE ne remplit que ce qui manque : rien de renseigne n'est
         ecrase, et un desaccord a deja ete montre a l'utilisateur. */
      await client.query(
        `UPDATE participants SET
           email     = COALESCE(email, $2),
           telephone = COALESCE(telephone, $3),
           genre     = COALESCE(genre, $4),
           age_range = COALESCE(age_range, $5),
           statut    = COALESCE(statut, $6),
           structure = COALESCE(structure, $7)
         WHERE id = $1`,
        [garder.id, fiche.email || null, fiche.telephone || null,
         fiche.genre || null, fiche.age_range || null, fiche.statut || null, fiche.structure || null]
      );

      await client.query(
        `INSERT INTO activity_participants (activity_id, participant_id)
         SELECT activity_id, $2 FROM activity_participants WHERE participant_id = $1
         ON CONFLICT DO NOTHING`,
        [id, garder.id]
      );

      /* Les activites de la fiche supprimee sont relevees avant de la
         supprimer : la fusion est definitive, et le journal d'audit est le
         seul endroit ou l'on pourra reconstituer ce qui a ete absorbe si un
         rapprochement se revele faux — deux homonymes, par exemple. */
      const { rows: activites } = await client.query(
        "SELECT activity_id FROM activity_participants WHERE participant_id = $1",
        [id]
      );

      await client.query("DELETE FROM participants WHERE id = $1", [id]);
      logAudit(req, "DELETE", "participants", id, `${fiche.prenom} ${fiche.nom}`, {
        motif: "fiche de la même personne, réunie",
        fusionnee_avec: garder.id,
        fiche_absorbee: {
          nom: fiche.nom,
          prenom: fiche.prenom,
          email: fiche.email || null,
          telephone: fiche.telephone || null,
          genre: fiche.genre || null,
          age_range: fiche.age_range || null,
          statut: fiche.statut || null,
          structure: fiche.structure || null,
          activites: activites.map((a) => a.activity_id),
        },
      });
      fusionnees += 1;
    }

    await client.query("COMMIT");
    ouverte = false;

    res.json({ fusionnees, ignorees: ids.length - fusionnees });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK");
    console.error("[FICHES DOUBLONS FUSION]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* ===== CORRIGER UNE IDENTITE =====
   Les noms viennent de feuilles de presence remplies a la main puis importees :
   les coquilles sont la regle, pas l'exception. Tant qu'elles restaient dans
   une liste, elles etaient sans gravite ; imprimees sur une attestation
   nominative remise a la personne, elles ne le sont plus.
   Volontairement limite au nom et au prenom : cette route sert a corriger une
   orthographe, pas a reattribuer une fiche a quelqu'un d'autre. L'email, lui,
   identifie le destinataire et ne se modifie pas d'un champ texte glisse dans
   un ecran d'envoi. */
router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const nom = String(req.body?.nom ?? "").trim();
    const prenom = String(req.body?.prenom ?? "").trim();

    /* Les deux colonnes sont NOT NULL : une chaine vide ferait echouer la
       requete avec un message que personne ne saurait lire. */
    if (!nom || !prenom) {
      return res.status(400).json({ error: "Le nom et le prénom sont tous deux requis." });
    }
    if (nom.length > 120 || prenom.length > 120) {
      return res.status(400).json({ error: "Nom ou prénom trop long." });
    }

    const avant = await pool.query("SELECT nom, prenom FROM participants WHERE id = $1", [req.params.id]);
    if (!avant.rows.length) return res.status(404).json({ error: "Participant introuvable" });

    const r = await pool.query(
      "UPDATE participants SET nom = $1, prenom = $2 WHERE id = $3 RETURNING id, nom, prenom, email",
      [nom, prenom, req.params.id]
    );

    /* Une identite corrigee se retrouve dans toutes les activites de la
       personne : la trace dit qui a change quoi, et depuis quelle valeur. */
    logAudit(req, "UPDATE", "participants", r.rows[0].id, `${prenom} ${nom}`, {
      avant: `${avant.rows[0].prenom} ${avant.rows[0].nom}`,
      apres: `${prenom} ${nom}`,
    });

    res.json(r.rows[0]);
  } catch (err) {
    console.error("[PARTICIPANT PATCH]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
