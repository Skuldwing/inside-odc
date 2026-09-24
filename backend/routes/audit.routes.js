const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

router.use(authMiddleware, requireAdmin);

/* Les filtres du journal, partages par la consultation et le telechargement :
   le fichier doit contenir exactement ce que l'ecran montre, sinon il ne
   repond pas a la question qu'on se posait en le demandant. */
function filtresDuJournal(req) {
  const { resource, action, user_id, from, to, search } = req.query;

  const conditions = [];
  const params = [];

  if (resource) {
    params.push(resource);
    conditions.push(`resource = $${params.length}`);
  }
  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }
  if (user_id) {
    params.push(Number(user_id));
    conditions.push(`user_id = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`created_at >= $${params.length}::date`);
  }
  if (to) {
    params.push(to);
    conditions.push(`created_at < ($${params.length}::date + interval '1 day')`);
  }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    params.push(`%${search}%`);
    const n2 = params.length;
    params.push(`%${search}%`);
    const n3 = params.length;
    /* Le detail aussi. Il porte ce qui permet de comprendre une ligne — le
       titre de l'activite concernee, le motif d'un retrait, l'ancienne et la
       nouvelle valeur. Sans lui, chercher « Community management » ne rendait
       rien : le libelle d'une inscription retiree est le nom de la personne,
       pas celui de l'activite, et il n'y avait aucun moyen de retrouver ce
       qui avait ete retire d'une activite donnee. */
    conditions.push(
      `(resource_label ILIKE $${n} OR user_full_name ILIKE $${n2} OR details::text ILIKE $${n3})`
    );
  }

  return {
    conditions, params,
    where: conditions.length ? "WHERE " + conditions.join(" AND ") : "",
  };
}

/* ===== GET AUDIT LOGS ===== */
router.get("/", async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const { conditions, params } = filtresDuJournal(req);

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
      params
    );
    const total = countResult.rows[0].total;

    params.push(Number(limit));
    params.push(Number(offset));
    const dataResult = await pool.query(
      `SELECT * FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ total, rows: dataResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== TELECHARGER LE JOURNAL =====
 *
 * Lire le journal page par page a l'ecran suffit pour verifier un geste ; pas
 * pour comprendre pourquoi une activite est passee de 302 beneficiaires a 279.
 * Il faut alors le tenir en entier, trier, compter — ce qu'un tableur fait et
 * qu'une liste paginee ne fait pas.
 *
 * Le fichier respecte les filtres de l'ecran : telecharger apres avoir filtre
 * sur « inscriptions » et sur le titre d'une activite donne les seules lignes
 * qui expliquent sa baisse, plutot que tout le journal.
 *
 * Il porte des donnees personnelles — noms, adresses, numeros, tels qu'ils
 * figuraient sur les fiches au moment du geste. C'est un document interne.
 */
const EN_TETES_CSV = [
  "Date", "Heure", "Auteur", "Rôle", "Action", "Ressource",
  "Identifiant", "Libellé", "Détail", "Adresse IP",
];

const LOT_EXPORT = 2000;

function celluleCsv(valeur) {
  if (valeur === null || valeur === undefined) return "";
  let texte = typeof valeur === "object" ? JSON.stringify(valeur) : String(valeur);
  /* Une cellule commencant par =, +, - ou @ est interpretee comme une formule
     par Excel : on la neutralise en la prefixant d'une apostrophe. */
  if (/^[=+\-@]/.test(texte)) texte = `'${texte}`;
  texte = texte.replace(/"/g, '""');
  return /[;"\n\r]/.test(texte) ? `"${texte}"` : texte;
}

const ligneCsv = (cellules) => cellules.map(celluleCsv).join(";");

router.get("/export.csv", async (req, res) => {
  try {
    const { where, params } = filtresDuJournal(req);

    const compte = await pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs ${where}`, params);
    const total = compte.rows[0].total;

    const horodatage = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="journal-audit-odc-${horodatage}.csv"`);
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Content-Disposition");
    res.setHeader("Cache-Control", "no-store");

    /* BOM : sans lui, Excel lit le fichier en ANSI et casse les accents. */
    res.write("﻿");
    res.write(ligneCsv(EN_TETES_CSV) + "\r\n");

    for (let debut = 0; debut < total; debut += LOT_EXPORT) {
      const lot = await pool.query(
        `SELECT created_at, user_full_name, user_role, action, resource,
                resource_id, resource_label, details, ip_address
           FROM audit_logs ${where}
          ORDER BY created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, LOT_EXPORT, debut]
      );
      for (const l of lot.rows) {
        const d = l.created_at ? new Date(l.created_at) : null;
        res.write(ligneCsv([
          d ? d.toISOString().slice(0, 10) : "",
          d ? d.toISOString().slice(11, 19) : "",
          l.user_full_name, l.user_role, l.action, l.resource,
          l.resource_id, l.resource_label, l.details, l.ip_address,
        ]) + "\r\n");
      }
    }

    res.end();
  } catch (err) {
    console.error("[AUDIT EXPORT]", err);
    /* L'en-tete est peut-etre deja parti : on ne peut alors que couper. */
    if (res.headersSent) return res.end();
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== LES RESSOURCES REELLEMENT JOURNALISEES =====
   La liste deroulante etait ecrite en dur et n'en proposait que quatre, alors
   que le journal en enregistre une vingtaine. Les retraits d'inscription, en
   particulier, etaient invisibles : impossible de savoir pourquoi le nombre de
   beneficiaires d'une activite avait baisse. Une liste ecrite a la main derive
   des que le code journalise autre chose ; on la lit donc dans le journal. */
router.get("/ressources", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT resource, COUNT(*)::int AS n
         FROM audit_logs
        WHERE resource IS NOT NULL AND resource <> ''
        GROUP BY resource
        ORDER BY resource`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[AUDIT RESSOURCES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET DISTINCT USERS WHO APPEAR IN LOGS ===== */
router.get("/actors", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT user_id, user_full_name, user_role
       FROM audit_logs
       WHERE user_id IS NOT NULL
       ORDER BY user_full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET NOTIFICATIONS (non-admin actions since last seen) ===== */
router.get("/notifications", async (req, res) => {
  try {
    const userRes = await pool.query(
      "SELECT notifications_last_seen_at FROM users WHERE id = $1",
      [req.user.id]
    );
    const lastSeen = userRes.rows[0]?.notifications_last_seen_at ?? null;

    const params = [];
    const conditions = ["(user_role IS NULL OR user_role != 'admin')"];

    // Si jamais vu : limiter aux 7 derniers jours pour ne pas surcharger
    const since = lastSeen ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    params.push(since);
    conditions.push(`created_at > $${params.length}`);

    const where = "WHERE " + conditions.join(" AND ");

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
      params
    );

    const itemsRes = await pool.query(
      `SELECT id, user_full_name, user_role, action, resource, resource_label, details, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC LIMIT 15`,
      params
    );

    // Tâches de suivi partenaire arrivées à échéance (ou en retard), non terminées.
    const taskRes = await pool.query(
      `SELECT pt.id, pt.title, pt.due_date, p.id AS partner_id, p.name AS partner_name
       FROM partner_tasks pt
       JOIN partners p ON p.id = pt.partner_id
       WHERE pt.completed = FALSE AND pt.due_date IS NOT NULL AND pt.due_date <= CURRENT_DATE
       ORDER BY pt.due_date ASC LIMIT 15`
    );

    const auditItems = itemsRes.rows.map((r) => ({ ...r, type: "audit" }));
    const taskItems = taskRes.rows.map((r) => ({
      id: `task-${r.id}`,
      type: "partner_task",
      title: r.title,
      due_date: r.due_date,
      partner_id: r.partner_id,
      partner_name: r.partner_name,
    }));

    res.json({
      count: countRes.rows[0].total + taskRes.rows.length,
      items: [...taskItems, ...auditItems],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MARK NOTIFICATIONS AS SEEN ===== */
router.post("/notifications/seen", async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET notifications_last_seen_at = NOW() WHERE id = $1",
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
