const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");

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

module.exports = router;
