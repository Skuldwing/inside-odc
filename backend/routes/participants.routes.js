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

/* ===== FICHES EN DOUBLE =====
   Une meme personne inscrite deux fois, dont une fois sans coordonnees.
   C'est la trace laissee par l'ancien import : il rapprochait les noms par
   egalite stricte, si bien qu'une variation d'ecriture — un accent, le nom de
   famille recopie dans la case « Prenom » — lui faisait creer une seconde
   fiche, forcement sans adresse puisque l'adresse appartenait deja a la
   premiere. L'import ne les fabrique plus ; celles qui existent sont encore la.

   On ne propose que les groupes ou une seule fiche porte des coordonnees. Deux
   fiches renseignees differemment peuvent etre deux personnes, et deux fiches
   vides sont indiscernables : dans les deux cas on ne devine pas. */
function grouperFichesDoubles(fiches) {
  const groupes = new Map();
  for (const f of fiches) {
    const cle = clePersonne(f.nom, f.prenom);
    if (!cle) continue;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(f);
  }

  const resultat = [];
  for (const membres of groupes.values()) {
    if (membres.length < 2) continue;
    const renseignees = membres.filter((f) => f.email || f.telephone);
    if (renseignees.length !== 1) continue;
    const garder = renseignees[0];
    resultat.push({
      garder,
      absorber: membres.filter((f) => f.id !== garder.id),
    });
  }
  return resultat;
}

router.get("/fiches-doublons", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone ${baseFrom}
       ORDER BY p.id`,
      params
    );

    const groupes = grouperFichesDoubles(r.rows);
    res.json({
      total: groupes.reduce((n, g) => n + g.absorber.length, 0),
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
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone ${baseFrom} ORDER BY p.id`,
      params
    );

    /* Le groupe se recalcule ici, sur l'etat courant : l'appelant designe les
       fiches a absorber, jamais celle a conserver. Une fiche qui a recu une
       adresse entre-temps n'est plus un doublon et sort d'elle-meme. */
    const aAbsorber = new Map(); // id a supprimer → id a conserver
    for (const groupe of grouperFichesDoubles(portee.rows)) {
      for (const fiche of groupe.absorber) {
        if (ids.includes(fiche.id)) aAbsorber.set(fiche.id, { garder: groupe.garder, fiche });
      }
    }

    await client.query("BEGIN");
    ouverte = true;

    let fusionnees = 0;
    for (const [id, { garder, fiche }] of aAbsorber) {
      await client.query(
        `INSERT INTO activity_participants (activity_id, participant_id)
         SELECT activity_id, $2 FROM activity_participants WHERE participant_id = $1
         ON CONFLICT DO NOTHING`,
        [id, garder.id]
      );
      await client.query("DELETE FROM participants WHERE id = $1", [id]);
      logAudit(req, "DELETE", "participants", id, `${fiche.prenom} ${fiche.nom}`, {
        motif: "fiche en double sans coordonnées",
        fusionnee_avec: garder.id,
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
