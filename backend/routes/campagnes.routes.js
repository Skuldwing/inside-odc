const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const pool = require("../db");
const { preparerEnvoi, lancerEnvoi, estEnCours, DEBIT_PAR_MINUTE } = require("../services/campagneEnvoi");
const { ensureCampagnesSchema, estSchemaManquant } = require("../migrations/campagnesSchema");

const router = express.Router();

/* Les migrations de demarrage ne sont pas attendues et n'echouent qu'en
   console.warn : si l'une d'elles n'est pas passee, la page Campagnes
   renverrait une erreur serveur a chaque appel sans rien expliquer. On la
   rejoue ici, une fois, plutot que de laisser la page morte. */
let schemaRejoue = false;
async function avecSchema(travail) {
  try {
    return await travail();
  } catch (err) {
    if (!estSchemaManquant(err) || schemaRejoue) throw err;
    schemaRejoue = true;
    console.warn("[CAMPAGNES] schéma incomplet, migration rejouée :", err.message);
    await ensureCampagnesSchema();
    return travail();
  }
}

/* L'adresse publique de l'API, telle que le destinataire la verra dans son
   lien de desabonnement. Elle est prise sur la requete de lancement plutot
   que devinee : l'envoi, lui, tourne hors requete. */
function baseApi(req) {
  return String(process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

/* ===== GET ALL ===== */
router.get("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await avecSchema(() =>
      pool.query(
        `SELECT id, name, type, message, subject, html_body,
                recipients_type, activity_id, custom_emails,
                send_mode, sent_count, failed_count, total_count,
                sent_at, started_at, finished_at, last_error, status, created_at
         FROM campagnes
         ORDER BY created_at DESC`
      )
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE ===== */
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const {
      name, type = "email", message = "",
      subject = "", html_body = "",
      recipients_type = "all_participants",
      activity_id = null,
      custom_emails = "[]",
      send_mode = "publipostage",
      status = "brouillon",
    } = req.body;

    if (!name) return res.status(400).json({ error: "Nom requis" });

    const result = await pool.query(
      `INSERT INTO campagnes
         (name, type, message, subject, html_body, recipients_type,
          activity_id, custom_emails, send_mode, sent_count, failed_count, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,0,$10,NOW())
       RETURNING *`,
      [name, type, message, subject, html_body, recipients_type,
       activity_id || null, custom_emails, send_mode, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE ===== */
router.put("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, type = "email", message = "",
      subject = "", html_body = "",
      recipients_type = "all_participants",
      activity_id = null,
      custom_emails = "[]",
      send_mode = "publipostage",
      status = "brouillon",
    } = req.body;

    if (!name) return res.status(400).json({ error: "Nom requis" });

    const result = await pool.query(
      `UPDATE campagnes
       SET name=$1, type=$2, message=$3, subject=$4, html_body=$5,
           recipients_type=$6, activity_id=$7, custom_emails=$8, send_mode=$9, status=$10
       WHERE id=$11
       RETURNING *`,
      [name, type, message, subject, html_body, recipients_type,
       activity_id || null, custom_emails, send_mode, status, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Campagne introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE ===== */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM campagnes WHERE id=$1 RETURNING id", [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Campagne introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ENVOI ===== */
/* L'envoi ne se fait plus dans la requete : on prepare la liste, on repond,
   et le travail continue en tache de fond. Une campagne de 400 personnes
   cadencee a 25 messages par minute dure seize minutes — aucun mandataire ne
   garde une requete ouverte aussi longtemps. */
router.post("/:id/send", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const campRes = await avecSchema(() => pool.query("SELECT * FROM campagnes WHERE id=$1", [id]));
    if (!campRes.rows.length) return res.status(404).json({ error: "Campagne introuvable" });

    const camp = campRes.rows[0];
    if (!camp.subject) return res.status(400).json({ error: "L'objet de l'email est requis" });
    if (!camp.html_body) return res.status(400).json({ error: "Le corps de l'email est requis" });
    if (estEnCours(id)) return res.status(409).json({ error: "L'envoi de cette campagne est deja en cours." });

    const { total, desabonnes } = await avecSchema(() => preparerEnvoi(camp));

    if (!total) {
      return res.status(400).json({
        error: desabonnes
          ? "Tous les destinataires de cette campagne se sont desabonnes."
          : "Aucun destinataire trouve pour cette campagne",
      });
    }

    /* Rien a envoyer alors que la liste n'est pas vide : tout le monde a deja
       recu le message. Le dire franchement plutot que d'annoncer un envoi de
       zero destinataire — et surtout, ne pas rouvrir la campagne. */
    const restants = await pool.query(
      `SELECT COUNT(*)::int AS n FROM campagne_envois WHERE campagne_id=$1 AND statut='en_attente'`,
      [id]
    );
    const aEnvoyer = restants.rows[0].n;
    if (!aEnvoyer) {
      return res.status(400).json({
        error:
          "Tous les destinataires de cette campagne ont deja recu ce message. Utilisez « Reprendre » pour reessayer les echecs.",
      });
    }

    await pool.query(
      `UPDATE campagnes SET status='en_cours', sent_at=NOW(), started_at=NOW(),
                            finished_at=NULL, last_error=NULL
       WHERE id=$1`,
      [id]
    );

    lancerEnvoi(id, baseApi(req));

    res.status(202).json({
      total,
      a_envoyer: aEnvoyer,
      desabonnes,
      debit_par_minute: DEBIT_PAR_MINUTE,
      duree_estimee_s: Math.ceil((aEnvoyer / DEBIT_PAR_MINUTE) * 60),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de l'envoi" });
  }
});

/* ===== AVANCEMENT ET JOURNAL ===== */
router.get("/:id/envois", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [camp, compte, lignes] = await avecSchema(() =>
      Promise.all([
        pool.query("SELECT id, name, status, total_count, started_at, finished_at, last_error FROM campagnes WHERE id=$1", [id]),
        pool.query(
          `SELECT statut, COUNT(*)::int AS n FROM campagne_envois WHERE campagne_id=$1 GROUP BY statut`,
          [id]
        ),
        pool.query(
          `SELECT email, nom, statut, erreur, traite_le
             FROM campagne_envois WHERE campagne_id=$1
            ORDER BY (statut='echec') DESC, traite_le DESC NULLS LAST, id
            LIMIT 500`,
          [id]
        ),
      ])
    );

    if (!camp.rows.length) return res.status(404).json({ error: "Campagne introuvable" });

    const parStatut = Object.fromEntries(compte.rows.map((r) => [r.statut, r.n]));
    res.json({
      campagne: camp.rows[0],
      en_cours: estEnCours(id),
      compte: {
        total: Object.values(parStatut).reduce((a, b) => a + b, 0),
        envoye: parStatut.envoye || 0,
        echec: parStatut.echec || 0,
        en_attente: parStatut.en_attente || 0,
        desabonne: parStatut.desabonne || 0,
      },
      envois: lignes.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ARRET ===== */
/* La boucle d'envoi relit le statut de la campagne entre deux messages : le
   passer a « arretee » suffit a l'interrompre sans tuer le processus. */
router.post("/:id/stop", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE campagnes SET status='arretee' WHERE id=$1 AND status='en_cours' RETURNING id",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(400).json({ error: "Cette campagne n'est pas en cours d'envoi." });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== REPRISE ===== */
/* Reprend une campagne interrompue — arret demande, redemarrage du serveur,
   panne du service d'envoi. Les lignes deja marquees « envoye » sont laissees
   telles quelles : personne ne recoit le message deux fois. */
router.post("/:id/reprendre", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (estEnCours(id)) return res.status(409).json({ error: "L'envoi est deja en cours." });

    /* Un echec peut venir d'une coupure passagere : on lui redonne sa chance. */
    await avecSchema(() =>
      pool.query(
        `UPDATE campagne_envois SET statut='en_attente', erreur=NULL, traite_le=NULL
          WHERE campagne_id=$1 AND statut='echec'`,
        [id]
      )
    );

    const restants = await pool.query(
      `SELECT COUNT(*)::int AS n FROM campagne_envois WHERE campagne_id=$1 AND statut='en_attente'`,
      [id]
    );
    if (!restants.rows[0].n) return res.status(400).json({ error: "Rien a reprendre : tout est deja parti." });

    await pool.query(
      "UPDATE campagnes SET status='en_cours', started_at=NOW(), finished_at=NULL, last_error=NULL WHERE id=$1",
      [id]
    );
    lancerEnvoi(id, baseApi(req));

    res.status(202).json({
      a_envoyer: restants.rows[0].n,
      duree_estimee_s: Math.ceil((restants.rows[0].n / DEBIT_PAR_MINUTE) * 60),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
