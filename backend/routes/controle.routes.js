const express = require("express");
const crypto = require("crypto");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { logAudit } = require("../services/audit");
const { sendEmail } = require("../services/mail");
const { separerDesabonnes, entetesDesabonnement } = require("../services/desabonnement");
const { getTemplate, renderTemplate, composerEmail, boutonAction } = require("./emailTemplates.routes");
const { IDENTITE } = require("../config/identite");
const { contreVerificationPrete } = require("../migrations/contreVerification");

/**
 * Contre-vérification des déclarations des partenaires — administrateurs seuls.
 *
 *  - Vérification auprès des bénéficiaires : un échantillon tiré au hasard par
 *    partenaire reçoit un email « Avez-vous participé ? ». Le taux de
 *    confirmation de chaque partenaire en sort.
 *  - Visites inopinées : des activités à venir tirées au hasard, où un agent
 *    passe et note l'effectif réel.
 */
const router = express.Router();
router.use(authMiddleware, requireAdmin);
router.use((req, res, next) => {
  contreVerificationPrete().then(() => next(), (err) => {
    console.error("[contrôle] schéma :", err.message);
    res.status(503).json({ error: "Mise à jour en cours, réessayez dans un instant." });
  });
});

const TAUX_DEFAUT = 5;      // % de chaque liste
const MINIMUM_DEFAUT = 10;  // personnes par partenaire, au moins
const EMAIL_VALIDE = "^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]{2,}$";

function adresseDuSite() {
  return String(process.env.APP_BASE_URL || IDENTITE.siteUrl).replace(/\/+$/, "");
}
function adresseApi(req) {
  return String(process.env.API_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}
function bornesDuMois(mois) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mois || ""));
  if (!m) return null;
  const annee = Number(m[1]);
  const num = Number(m[2]);
  if (num < 1 || num > 12) return null;
  const dernier = new Date(Date.UTC(annee, num, 0)).getUTCDate();
  return { du: `${m[1]}-${m[2]}-01`, au: `${m[1]}-${m[2]}-${String(dernier).padStart(2, "0")}` };
}
/* Mélange équitable (Fisher-Yates) sur un générateur cryptographique : un
   tirage prévisible ne serait plus un contrôle. */
function melanger(liste) {
  const t = [...liste];
  for (let i = t.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}
const dateFr = (d) => {
  if (!d) return "";
  const x = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  return x.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/* ── L'envoi, après la réponse HTTP ──
   Des centaines de messages ne tiennent pas dans le temps d'une requête. On
   répond tout de suite, et l'écran suit l'avancement. */
async function envoyerVerifications(ids, apiBase) {
  const tpl = await getTemplate("verification_participation");
  for (const id of ids) {
    try {
      const { rows } = await pool.query(
        `SELECT v.id, v.jeton, v.email, p.prenom, a.title, a.activity_date, a.location, pr.name AS partenaire
           FROM verifications_beneficiaires v
           LEFT JOIN participants p ON p.id = v.participant_id
           JOIN activities a ON a.id = v.activity_id
           LEFT JOIN partners pr ON pr.id = v.partner_id
          WHERE v.id = $1 AND v.envoye_le IS NULL`,
        [id]
      );
      const v = rows[0];
      if (!v) continue;
      const lien = `${adresseDuSite()}/verification/${v.jeton}`;
      const vars = {
        prenom: v.prenom || "",
        activite: v.title || "une activité",
        date: `Le ${dateFr(v.activity_date)}`,
        lieu: v.location ? ` · ${v.location}` : "",
        partenaire: v.partenaire ? ` · avec ${v.partenaire}` : "",
        lien,
        bouton: boutonAction(lien, "Répondre"),
      };
      await sendEmail({
        toEmail: v.email,
        toName: v.prenom || undefined,
        subject: renderTemplate(tpl.subject, vars),
        html: composerEmail(tpl, vars),
        text:
          `Bonjour ${v.prenom || ""},\n\n${IDENTITE.nom} vérifie la qualité des activités menées avec ses partenaires.\n` +
          `Avez-vous participé à « ${v.title} » le ${dateFr(v.activity_date)} ?\n\nRépondez ici : ${lien}\n`,
        headers: entetesDesabonnement(apiBase, v.email),
      });
      await pool.query("UPDATE verifications_beneficiaires SET envoye_le = NOW(), erreur_envoi = NULL WHERE id = $1", [id]);
    } catch (err) {
      await pool.query("UPDATE verifications_beneficiaires SET erreur_envoi = $2 WHERE id = $1",
        [id, String(err.message || err).slice(0, 300)]).catch(() => {});
    }
  }
}

/* ===== TIRER L'ÉCHANTILLON D'UN MOIS ===== */
router.post("/verifications/tirage", async (req, res) => {
  try {
    const mois = String(req.body?.mois || "");
    const bornes = bornesDuMois(mois);
    if (!bornes) return res.status(400).json({ error: "Mois invalide (AAAA-MM)." });
    const taux = Math.min(Math.max(Number(req.body?.taux) || TAUX_DEFAUT, 1), 100);
    const minimum = Math.min(Math.max(Number(req.body?.minimum) || MINIMUM_DEFAUT, 1), 500);

    const deja = await pool.query("SELECT COUNT(*)::int AS n FROM verifications_beneficiaires WHERE campagne = $1", [mois]);
    if (deja.rows[0].n > 0) {
      return res.status(409).json({ error: `L'échantillon de ${mois} est déjà tiré.` });
    }

    /* Une personne = une adresse ; on lui pose la question sur une seule de
       ses activités du mois, choisie au hasard. Les activités rejetées sont
       hors champ : elles ne comptent déjà plus. */
    const { rows: candidats } = await pool.query(
      `SELECT DISTINCT ON (LOWER(TRIM(p.email)))
              p.id AS participant_id, LOWER(TRIM(p.email)) AS email,
              a.id AS activity_id, COALESCE(a.partner_id, uc.partner_id) AS partner_id
         FROM activities a
         LEFT JOIN users uc ON uc.id = a.coach_id
         JOIN activity_participants ap ON ap.activity_id = a.id
         JOIN participants p ON p.id = ap.participant_id
        WHERE a.activity_date BETWEEN $1 AND $2
          /* Seulement ce qui a eu lieu : on ne demande pas « y étiez-vous ? »
             pour une activité de la semaine prochaine. */
          AND COALESCE(a.date_fin, a.activity_date) < CURRENT_DATE
          AND COALESCE(a.partner_id, uc.partner_id) IS NOT NULL
          AND COALESCE(a.reliability_status, 'a_verifier') <> 'rejetee'
          AND TRIM(COALESCE(p.email, '')) ~* $3
        ORDER BY LOWER(TRIM(p.email)), random()`,
      [bornes.du, bornes.au, EMAIL_VALIDE]
    );
    const { retenus, desabonnes } = await separerDesabonnes(candidats);

    const parPartenaire = new Map();
    for (const c of retenus) {
      if (!parPartenaire.has(c.partner_id)) parPartenaire.set(c.partner_id, []);
      parPartenaire.get(c.partner_id).push(c);
    }
    const tires = [];
    for (const liste of parPartenaire.values()) {
      const k = Math.min(liste.length, Math.max(minimum, Math.ceil((liste.length * taux) / 100)));
      tires.push(...melanger(liste).slice(0, k));
    }
    if (!tires.length) {
      return res.status(400).json({ error: "Aucun bénéficiaire joignable par email sur ce mois." });
    }

    const ids = [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const t of tires) {
        const { rows } = await client.query(
          `INSERT INTO verifications_beneficiaires
             (jeton, campagne, participant_id, activity_id, partner_id, email, cree_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (campagne, participant_id) DO NOTHING
           RETURNING id`,
          [crypto.randomBytes(24).toString("base64url"), mois, t.participant_id, t.activity_id,
           t.partner_id, t.email, req.user.id]
        );
        if (rows[0]) ids.push(rows[0].id);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    logAudit(req, "CREATE", "verifications_beneficiaires", mois, `Contre-vérification ${mois}`, {
      tires: ids.length, partenaires: parPartenaire.size, taux, minimum, desabonnes: desabonnes.length,
    });
    res.status(201).json({
      campagne: mois, tires: ids.length, partenaires: parPartenaire.size,
      joignables: retenus.length, desabonnes: desabonnes.length,
    });

    if (req.body?.envoyer !== false) {
      envoyerVerifications(ids, adresseApi(req)).catch((err) =>
        console.error("[contre-vérification] envoi :", err.message));
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== RENVOYER CE QUI N'EST PAS PARTI ===== */
router.post("/verifications/:mois/renvoyer", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id FROM verifications_beneficiaires WHERE campagne = $1 AND envoye_le IS NULL",
      [req.params.mois]
    );
    await pool.query(
      "UPDATE verifications_beneficiaires SET erreur_envoi = NULL WHERE campagne = $1 AND envoye_le IS NULL",
      [req.params.mois]
    );
    res.json({ relances: rows.length });
    envoyerVerifications(rows.map((r) => r.id), adresseApi(req)).catch((err) =>
      console.error("[contre-vérification] renvoi :", err.message));
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== RÉSULTATS =====
   Sans « mois » : la campagne la plus récente. */
router.get("/verifications", async (req, res) => {
  try {
    const { rows: campagnes } = await pool.query(
      `SELECT campagne, COUNT(*)::int AS tires, MIN(cree_le) AS cree_le
         FROM verifications_beneficiaires GROUP BY campagne ORDER BY campagne DESC`
    );
    const mois = String(req.query.mois || campagnes[0]?.campagne || "");
    if (!mois) return res.json({ campagnes, mois: null, partenaires: [], negatives: [] });

    const { rows: partenaires } = await pool.query(
      `SELECT v.partner_id, COALESCE(pr.name, 'Partenaire #' || v.partner_id) AS partenaire,
              COUNT(*)::int AS tires,
              COUNT(*) FILTER (WHERE v.envoye_le IS NOT NULL)::int AS envoyes,
              COUNT(*) FILTER (WHERE v.erreur_envoi IS NOT NULL)::int AS erreurs,
              COUNT(*) FILTER (WHERE v.envoye_le IS NULL AND v.erreur_envoi IS NULL)::int AS en_attente,
              COUNT(*) FILTER (WHERE v.reponse = 'oui')::int AS oui,
              COUNT(*) FILTER (WHERE v.reponse = 'non')::int AS non
         FROM verifications_beneficiaires v
         LEFT JOIN partners pr ON pr.id = v.partner_id
        WHERE v.campagne = $1
        GROUP BY v.partner_id, pr.name
        ORDER BY COUNT(*) FILTER (WHERE v.reponse = 'non') DESC, pr.name`,
      [mois]
    );
    const { rows: negatives } = await pool.query(
      `SELECT v.id, v.repondu_le, v.commentaire, v.email,
              p.id AS participant_id, p.prenom, p.nom,
              a.id AS activity_id, a.title, a.activity_date,
              COALESCE(pr.name, '—') AS partenaire
         FROM verifications_beneficiaires v
         LEFT JOIN participants p ON p.id = v.participant_id
         LEFT JOIN activities a ON a.id = v.activity_id
         LEFT JOIN partners pr ON pr.id = v.partner_id
        WHERE v.campagne = $1 AND v.reponse = 'non'
        ORDER BY v.repondu_le DESC`,
      [mois]
    );
    res.json({ campagnes, mois, partenaires, negatives });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== VISITES INOPINÉES ===== */
router.post("/visites/tirage", async (req, res) => {
  try {
    const nombre = Math.min(Math.max(Number(req.body?.nombre) || 3, 1), 20);
    const jours = Math.min(Math.max(Number(req.body?.jours) || 30, 1), 90);
    const { rows: candidates } = await pool.query(
      `SELECT a.id
         FROM activities a
         LEFT JOIN users uc ON uc.id = a.coach_id
        WHERE a.activity_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int
          AND COALESCE(a.partner_id, uc.partner_id) IS NOT NULL
          AND COALESCE(a.mode, 'presentiel') <> 'ligne'
          AND NOT EXISTS (SELECT 1 FROM visites_inopinees vi WHERE vi.activity_id = a.id)`,
      [jours]
    );
    const choisies = melanger(candidates).slice(0, nombre);
    for (const c of choisies) {
      await pool.query(
        "INSERT INTO visites_inopinees (activity_id, tiree_par) VALUES ($1, $2) ON CONFLICT (activity_id) DO NOTHING",
        [c.id, req.user.id]
      );
    }
    logAudit(req, "CREATE", "visites_inopinees", null, "Tirage de visites inopinées", {
      tirees: choisies.length, candidates: candidates.length, jours,
    });
    res.status(201).json({ tirees: choisies.length, candidates: candidates.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/visites", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT vi.id, vi.activity_id, vi.tiree_le, vi.visite_le, vi.visiteur, vi.effectif_constate, vi.commentaire,
              a.title, a.activity_date, a.location,
              COALESCE(pr.name, '—') AS partenaire,
              (SELECT COUNT(*) FROM activity_participants ap WHERE ap.activity_id = a.id)::int AS effectif_declare
         FROM visites_inopinees vi
         JOIN activities a ON a.id = vi.activity_id
         LEFT JOIN users uc ON uc.id = a.coach_id
         LEFT JOIN partners pr ON pr.id = COALESCE(a.partner_id, uc.partner_id)
        ORDER BY (vi.effectif_constate IS NULL) DESC, a.activity_date ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.patch("/visites/:id", async (req, res) => {
  try {
    const effectif = req.body?.effectif_constate;
    const n = effectif === "" || effectif == null ? null : Number(effectif);
    if (n != null && (!Number.isInteger(n) || n < 0)) {
      return res.status(400).json({ error: "Effectif constaté invalide." });
    }
    const visite = req.body?.visite_le ? String(req.body.visite_le).slice(0, 10) : null;
    const { rows } = await pool.query(
      `UPDATE visites_inopinees
          SET effectif_constate = $1, visite_le = $2,
              visiteur = NULLIF(TRIM($3), ''), commentaire = NULLIF(TRIM($4), '')
        WHERE id = $5 RETURNING id, activity_id`,
      [n, visite, String(req.body?.visiteur || "").slice(0, 200), String(req.body?.commentaire || "").slice(0, 2000), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Visite introuvable" });
    logAudit(req, "UPDATE", "visites_inopinees", rows[0].id, `Visite activité #${rows[0].activity_id}`, {
      effectif_constate: n,
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/visites/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM visites_inopinees WHERE id = $1", [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: "Visite introuvable" });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
module.exports.bornesDuMois = bornesDuMois;
