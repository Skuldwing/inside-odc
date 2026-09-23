const express = require("express");
const multer = require("multer");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { sendEmail } = require("../services/mail");
const { trierAdresses } = require("../services/adressesValides");
const { attestationPourActivite, moduleRetenu } = require("../services/attestationActivite");

const { getTemplate, renderTemplate } = require("./emailTemplates.routes");
const { logAudit } = require("../services/audit");
const { computeAndStoreReliability } = require("../services/reliability");
const { ensureCoachDevicesSchema, tableAbsente } = require("../migrations/coachDevices");
const { ensureAttestationsEnvoyees } = require("../migrations/attestationsEnvoyees");
const { ensureEmargementPartenaire } = require("../migrations/emargementPartenaire");

const router = express.Router();

const reportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const PHOTO_MAX_PER_ACTIVITY = 8;

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Seules les images sont acceptées"));
  },
});

/* Colonnes d'activites renvoyees par l'API — report_data en est volontairement
   absente. C'est le PDF du rapport, jusqu'a 10 Mo, stocke dans la table : un
   « SELECT a.* » l'embarquait dans chaque reponse. Node serialise un Buffer en
   { "type": "Buffer", "data": [171, 205, ...] }, soit environ quatre octets de
   JSON par octet de PDF — la liste des activites pesait des dizaines de Mo.
   Le fichier se telecharge par /activities/:id/report, et report_filename
   suffit a savoir qu'il existe. */
/* Les memes colonnes, sans prefixe de table : pour les clauses RETURNING, qui
   renvoyaient « * » — donc le PDF du rapport a chaque enregistrement. */
const ACTIVITY_RETURNING = `
  id, title, description, activity_date, duration_hours, location,
  device_id, partner_id, created_by, created_at, participants_manual,
  date_fin, coach_id, report_filename, mode, reliability_score,
  reliability_status, reliability_details, reliability_manual_override,
  duplicate_of
`;

const ACTIVITY_COLUMNS = `
  a.id, a.title, a.description, a.activity_date, a.duration_hours, a.location,
  a.device_id, a.partner_id, a.created_by, a.created_at, a.participants_manual,
  a.date_fin, a.coach_id, a.report_filename, a.mode, a.reliability_score,
  a.reliability_status, a.reliability_details, a.reliability_manual_override,
  a.duplicate_of
`;

/* Un administrateur peut confier une activite a un coach. On verifie que
   l'identifiant recu designe bien un compte de ce role : sans ce controle, on
   pourrait rattacher une activite a un partenaire ou a un lecteur, qui la
   verrait apparaitre sans rien y comprendre. */
async function coachValide(coachId) {
  if (!coachId) return null;
  const res = await pool.query(
    "SELECT id FROM users WHERE id = $1 AND role = 'coach'",
    [coachId]
  );
  return res.rows[0]?.id ?? null;
}

/* Dispositifs confies au coach. Ses activites recevaient device_id = NULL
   d'office : elles n'apparaissaient donc dans aucune repartition par
   dispositif, alors que ce sont elles qui les remplissent. */
async function dispositifsDuCoach(userId) {
  try {
    const res = await pool.query(
      "SELECT device_id FROM user_devices WHERE user_id = $1",
      [userId]
    );
    return res.rows.map((r) => r.device_id);
  } catch (err) {
    if (!tableAbsente(err)) throw err;
    await ensureCoachDevicesSchema();
    return [];
  }
}

/* Le dispositif retenu pour un coach : celui demande s'il lui est confie,
   rien sinon. Un coach ne choisit pas dans le catalogue entier. */
async function dispositifAutorisePourCoach(userId, deviceId) {
  const demande = Number(deviceId) || null;
  if (!demande) return null;
  const autorises = await dispositifsDuCoach(userId);
  return autorises.includes(demande) ? demande : null;
}

function requireWriteAccess(req, res, next) {
  if (req.user.role === "viewer") {
    return res.status(403).json({ error: "Accès refusé" });
  }
  next();
}

function isOwner(req, activity) {
  if (req.user.role === "partner") return activity.partner_id === req.user.partner_id;
  if (req.user.role === "coach") return activity.coach_id === req.user.id;
  return true; // admin
}

/* ===== GET ACTIVITIES ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT ${ACTIVITY_COLUMNS},
             p.name AS partner_name,
             d.name AS device_name,
             u.full_name AS coach_name,
             /* Le partenaire peut avoir ferme l'emargement par lien et QR
                code. Une activite sans partenaire n'est soumise a aucune
                convention : il y reste ouvert. */
             COALESCE(p.emargement_actif, TRUE) AS emargement_actif,
             COALESCE(ap.participants_count, 0) AS participants_count,
             COALESCE(ph.photo_count, 0) AS photo_count,
             /* Ou en est l'envoi des attestations, sans avoir a ouvrir
                l'activite. Le denominateur est le nombre de personnes
                joignables, pas le nombre d'inscrits : une personne sans
                adresse ne recevra jamais rien, et la compter ferait afficher
                « 18 / 24 » pour un envoi pourtant termine. */
             COALESCE(att.attestations_envoyees, 0) AS attestations_envoyees,
             COALESCE(joi.participants_joignables, 0) AS participants_joignables
      FROM activities a
      LEFT JOIN partners p ON a.partner_id = p.id
      LEFT JOIN devices d ON a.device_id = d.id
      LEFT JOIN users u ON a.coach_id = u.id
      LEFT JOIN (
        SELECT activity_id, COUNT(*)::int AS participants_count
        FROM activity_participants
        GROUP BY activity_id
      ) ap ON ap.activity_id = a.id
      LEFT JOIN (
        SELECT ap2.activity_id, COUNT(*)::int AS participants_joignables
        FROM activity_participants ap2
        JOIN participants pa ON pa.id = ap2.participant_id
        WHERE COALESCE(TRIM(pa.email), '') <> ''
        GROUP BY ap2.activity_id
      ) joi ON joi.activity_id = a.id
      LEFT JOIN (
        SELECT activity_id, COUNT(*)::int AS attestations_envoyees
        FROM attestations_envoyees
        GROUP BY activity_id
      ) att ON att.activity_id = a.id
      LEFT JOIN (
        SELECT activity_id, COUNT(*)::int AS photo_count
        FROM activity_photos
        GROUP BY activity_id
      ) ph ON ph.activity_id = a.id
    `;

    const params = [];

    if (req.user.role === "partner") {
      query += " WHERE a.partner_id = $1";
      params.push(req.user.partner_id);
    } else if (req.user.role === "coach") {
      query += " WHERE a.coach_id = $1";
      params.push(req.user.id);
    }

    query += " ORDER BY a.activity_date DESC";

    /* Cette liste est la page d'accueil du travail quotidien : elle ne doit
       pas tomber parce qu'une migration de demarrage a echoue. On les rejoue
       et on reessaie une fois. Le code 42703 — colonne inconnue — compte
       autant que 42P01 : il suffit d'une colonne manquante pour que la
       requete entiere echoue, et l'ecran avec elle. */
    const schemaIncomplet = (err) => err?.code === "42P01" || err?.code === "42703";
    let result;
    try {
      result = await pool.query(query, params);
    } catch (err) {
      if (!schemaIncomplet(err)) throw err;
      await ensureAttestationsEnvoyees();
      await ensureEmargementPartenaire();
      result = await pool.query(query, params);
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE ACTIVITY ===== */
router.post("/", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const {
      title,
      description,
      activity_date,
      date_fin,
      duration_hours,
      location,
      device_id,
      partner_id,
      participants_manual,
    } = req.body;

    if (!title || !activity_date) {
      return res.status(400).json({ error: "Titre et date requis" });
    }

    let resolvedPartnerId = partner_id || null;
    let resolvedDeviceId = device_id || null;
    let resolvedCoachId = null;

    if (req.user.role === "partner") {
      resolvedPartnerId = req.user.partner_id;
    } else if (req.user.role === "coach") {
      resolvedPartnerId = null;
      resolvedCoachId = req.user.id;
      resolvedDeviceId = await dispositifAutorisePourCoach(req.user.id, device_id);
    } else if (req.user.role === "admin") {
      resolvedCoachId = await coachValide(req.body.coach_id);
    }

    const resolvedMode = ["ligne", "presentiel"].includes(req.body.mode)
      ? req.body.mode
      : "presentiel";

    const result = await pool.query(
      `
      INSERT INTO activities
      (title, description, activity_date, date_fin, duration_hours, location, device_id, partner_id, created_by, participants_manual, coach_id, mode)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING ${ACTIVITY_RETURNING}
      `,
      [
        title,
        description,
        activity_date,
        date_fin || null,
        duration_hours || null,
        location,
        resolvedDeviceId,
        resolvedPartnerId,
        req.user.id,
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
        resolvedCoachId,
        resolvedMode,
      ]
    );

    const created = result.rows[0];
    logAudit(req, "CREATE", "activities", created.id, created.title, {
      date: created.activity_date,
      mode: created.mode,
      lieu: created.location || null,
      duree_heures: created.duration_hours || null,
      participants_manuels: created.participants_manual || null,
    });
    await computeAndStoreReliability(created.id).catch((e) => console.warn("Reliability:", e.message));
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE ACTIVITY ===== */
router.put("/:id", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      activity_date,
      date_fin,
      duration_hours,
      location,
      device_id,
      partner_id,
      participants_manual,
    } = req.body;

    if (!title || !activity_date) {
      return res.status(400).json({ error: "Titre et date requis" });
    }

    const existing = await pool.query(
      "SELECT id, title, activity_date, date_fin, location, duration_hours, mode, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (!isOwner(req, existing.rows[0])) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const before = existing.rows[0];

    const resolvedPartnerId =
      req.user.role === "partner" ? req.user.partner_id
      : req.user.role === "coach" ? null
      : partner_id || null;

    const resolvedDeviceId =
      req.user.role === "coach"
        ? await dispositifAutorisePourCoach(req.user.id, device_id)
        : device_id || null;

    /* Seul un administrateur reaffecte une activite ; pour les autres roles le
       coach en place est conserve tel quel. */
    const resolvedCoachId =
      req.user.role === "admin"
        ? await coachValide(req.body.coach_id)
        : before.coach_id;

    const resolvedMode = ["ligne", "presentiel"].includes(req.body.mode)
      ? req.body.mode
      : "presentiel";

    const result = await pool.query(
      `
      UPDATE activities
      SET title = $1,
          description = $2,
          activity_date = $3,
          date_fin = $4,
          duration_hours = $5,
          location = $6,
          device_id = $7,
          partner_id = $8,
          participants_manual = $9,
          mode = $10,
          coach_id = $11
      WHERE id = $12
      RETURNING ${ACTIVITY_RETURNING}
      `,
      [
        title,
        description || null,
        activity_date,
        date_fin || null,
        duration_hours || null,
        location || null,
        resolvedDeviceId,
        resolvedPartnerId,
        participants_manual != null && participants_manual !== "" ? Number(participants_manual) : null,
        resolvedMode,
        resolvedCoachId,
        id,
      ]
    );

    const updated = result.rows[0];
    const toDate = (v) => v ? String(v).slice(0, 10) : null;
    const modifications = {};
    if (before.title !== updated.title) modifications.titre = { avant: before.title, apres: updated.title };
    if (toDate(before.activity_date) !== toDate(updated.activity_date)) modifications.date = { avant: toDate(before.activity_date), apres: toDate(updated.activity_date) };
    if (toDate(before.date_fin) !== toDate(updated.date_fin)) modifications.date_fin = { avant: toDate(before.date_fin), apres: toDate(updated.date_fin) };
    if ((before.location || null) !== (updated.location || null)) modifications.lieu = { avant: before.location || null, apres: updated.location || null };
    if ((before.mode || null) !== (updated.mode || null)) modifications.mode = { avant: before.mode, apres: updated.mode };
    if (String(before.duration_hours ?? "") !== String(updated.duration_hours ?? "")) modifications.duree_heures = { avant: before.duration_hours, apres: updated.duration_hours };
    logAudit(req, "UPDATE", "activities", updated.id, updated.title, {
      modifications: Object.keys(modifications).length > 0 ? modifications : undefined,
      date: updated.activity_date,
    });
    await computeAndStoreReliability(updated.id).catch((e) => console.warn("Reliability:", e.message));
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== EXPORT LISTE PRESENCES PAR ACTIVITE ===== */
/* ===== PARTICIPANTS D'UNE ACTIVITE =====
   Le nom est trace sur l'attestation : avant d'en envoyer cinquante, il faut
   pouvoir relire la liste. Elle n'existait qu'en export tableur, ce qui oblige
   a quitter la plateforme pour verifier une orthographe. */
router.get("/:id/participants", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const actRes = await pool.query(
      "SELECT id, title, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });
    if (!isOwner(req, actRes.rows[0])) return res.status(403).json({ error: "Accès refusé" });

    const r = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.email,
              ae.envoye_le AS attestation_envoyee_le,
              ae.module    AS attestation_module
         FROM participants p
         JOIN activity_participants ap ON ap.participant_id = p.id
         LEFT JOIN attestations_envoyees ae
                ON ae.activity_id = ap.activity_id AND ae.participant_id = p.id
        WHERE ap.activity_id = $1
        ORDER BY p.nom, p.prenom`,
      [id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error("[ACTIVITE PARTICIPANTS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/:id/participants/export", authMiddleware, async (req, res) => {
  try {
    const XLSX = require("xlsx");
    const { id } = req.params;

    const actRes = await pool.query(
      `SELECT a.title, a.activity_date, a.partner_id, a.coach_id, p.name AS partner_name
       FROM activities a LEFT JOIN partners p ON p.id = a.partner_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activite introuvable" });

    const activity = actRes.rows[0];

    if (req.user.role === "viewer") {
      return res.status(403).json({ error: "Accès refusé" });
    }
    if (!isOwner(req, activity)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const partRes = await pool.query(
      `SELECT p.prenom, p.nom, p.telephone, p.email, p.genre, p.age_range, p.structure
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       WHERE ap.activity_id = $1
       ORDER BY p.nom, p.prenom`,
      [id]
    );

    const rows = partRes.rows.map((p) => ({
      "Prenom": p.prenom || "",
      "Nom": p.nom || "",
      "Telephone": p.telephone || "",
      "Email": p.email || "",
      "Genre": p.genre === "F" ? "Femme" : p.genre === "H" ? "Homme" : p.genre || "",
      "Tranche d'age": p.age_range || "",
      "Structure / Etablissement": p.structure || "",
    }));

    const ws = XLSX.utils.json_to_sheet(
      rows.length > 0
        ? rows
        : [{ "Prenom": "", "Nom": "", "Telephone": "", "Email": "", "Genre": "", "Tranche d'age": "", "Structure / Etablissement": "" }]
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presences");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const safeName = activity.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const filename = `presences_${safeName}_${activity.activity_date}.xlsx`;

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SUPPRIMER LA LISTE DE PARTICIPANTS ===== */
router.delete("/:id/participants", authMiddleware, requireWriteAccess, async (req, res) => {
  const { id } = req.params;
  try {
    const actRes = await pool.query(
      "SELECT partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });
    if (!isOwner(req, actRes.rows[0])) return res.status(403).json({ error: "Accès refusé" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const del = await client.query(
        "DELETE FROM activity_participants WHERE activity_id = $1",
        [id]
      );
      await client.query(
        "UPDATE activities SET participants_manual = NULL WHERE id = $1",
        [id]
      );
      await client.query("COMMIT");
      await computeAndStoreReliability(id).catch((e) => console.warn("Reliability:", e.message));
      res.json({ deleted: del.rowCount });
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[PARTICIPANTS DELETE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== APERCU D'UNE ATTESTATION =====
   Envoyer cent attestations sans en avoir vu une seule est un pari. Cette
   route rend le document tel qu'il partira, avec le premier participant de
   l'activite — ou un nom d'exemple si la liste est vide. */
router.get("/:id/attestation-apercu", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const actRes = await pool.query(
      `SELECT ${ACTIVITY_COLUMNS}, p.name AS partner_name, d.name AS device_name, u.full_name AS coach_name
       FROM activities a
       LEFT JOIN partners p ON p.id = a.partner_id
       LEFT JOIN devices  d ON d.id  = a.device_id
       LEFT JOIN users    u ON u.id  = a.coach_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    const activity = actRes.rows[0];
    if (!isOwner(req, activity)) return res.status(403).json({ error: "Accès refusé" });

    const partRes = await pool.query(
      `SELECT p.nom, p.prenom
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       WHERE ap.activity_id = $1
       ORDER BY p.nom, p.prenom
       LIMIT 1`,
      [id]
    );

    const participant = partRes.rows[0] || { prenom: "Prénom", nom: "Nom du participant" };
    const pdf = await attestationPourActivite({ participant, activity, module: req.query.module });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="attestation-apercu.pdf"');
    /* Sans en-tete, le navigateur applique sa propre heuristique et peut
       garder ce PDF : on a alors beau corriger la maquette et redeployer,
       l'apercu continue d'afficher l'ancien document. Un document nominatif
       n'a de toute facon rien a faire dans un cache partage. */
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (err) {
    console.error("[ATTESTATION APERCU]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== REMETTRE UNE ATTESTATION DANS LES RESTANTS =====
 *
 * Une attestation partie a une adresse fautive n'est jamais arrivee. La trace
 * dit pourtant « recue », et cette trace est ce qui empeche un second envoi :
 * la personne serait donc definitivement privee de son document, alors que
 * c'est precisement le cas ou il faut le renvoyer.
 *
 * On efface la trace pour ce couple (activite, personne) : elle repart dans
 * les restants et sera servie au prochain envoi, a sa nouvelle adresse. Rien
 * n'est expedie ici — l'envoi reste une action explicite.
 */
router.delete("/:id/attestations-envoyees/:participantId", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id, participantId } = req.params;

    const actRes = await pool.query(
      `SELECT ${ACTIVITY_COLUMNS} FROM activities a WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });
    if (!isOwner(req, actRes.rows[0])) return res.status(403).json({ error: "Accès refusé" });

    const r = await pool.query(
      `DELETE FROM attestations_envoyees
        WHERE activity_id = $1 AND participant_id = $2
        RETURNING email, module, envoye_le`,
      [id, participantId]
    );
    if (!r.rows.length) {
      return res.status(404).json({ error: "Aucun envoi enregistré pour cette personne." });
    }

    /* Ce que l'on efface est une preuve d'envoi : le journal la conserve. */
    logAudit(req, "DELETE", "attestations_envoyees", Number(participantId), actRes.rows[0].title, {
      adresse_utilisee: r.rows[0].email,
      module: r.rows[0].module,
      envoye_le: r.rows[0].envoye_le,
      motif: "adresse corrigée, attestation à renvoyer",
    });

    res.json({ ok: true });
  } catch (err) {
    if (tableAbsente(err)) return res.status(404).json({ error: "Aucun envoi enregistré." });
    console.error("[ATTESTATION A RENVOYER]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SEND ATTESTATIONS ===== */
router.post("/:id/send-attestations", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const actRes = await pool.query(
      `SELECT ${ACTIVITY_COLUMNS}, p.name AS partner_name, d.name AS device_name, u.full_name AS coach_name
       FROM activities a
       LEFT JOIN partners p ON p.id = a.partner_id
       LEFT JOIN devices  d ON d.id  = a.device_id
       LEFT JOIN users    u ON u.id  = a.coach_id
       WHERE a.id = $1`,
      [id]
    );
    if (!actRes.rows.length) {
      return res.status(404).json({ error: "Activité introuvable" });
    }
    const activity = actRes.rows[0];

    if (!isOwner(req, activity)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const partRes = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.email
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       WHERE ap.activity_id = $1
       ORDER BY p.nom, p.prenom`,
      [id]
    );

    /* Le meme intitule sert au document et au message qui le porte : les voir
       diverger serait deroutant pour le destinataire. */
    const intitule = moduleRetenu(activity, req.body?.module);

    const participants = partRes.rows;
    const withoutEmail = participants.filter((p) => !p.email);

    /* Meme garde-fou que pour les campagnes : une adresse dont le domaine
       n'existe pas n'est jamais presentee au service d'envoi. Le rebond ne
       ferait pas arriver l'attestation, et il compterait contre la reputation
       du compte — ce qui, lui, empeche les envois suivants d'arriver. */
    const { retenus, rejetes } = await trierAdresses(
      participants.filter((p) => p.email).map((p) => ({ email: p.email, nom: `${p.prenom} ${p.nom}`, participant: p }))
    );
    const joignables = new Set(retenus.map((d) => d.email));
    const withEmail = participants.filter((p) => p.email && joignables.has(String(p.email).trim().toLowerCase()));
    const injoignables = rejetes.map((d) => ({ email: d.email, explication: d.explication }));

    /* Ceux qui l'ont deja recue ne la recoivent pas deux fois. Renvoyer le
       meme document a la meme personne est au mieux desagreable, au pire pris
       pour du spam par sa messagerie — et cela compte contre la reputation du
       compte d'expedition. */
    const { rows: dejaRecues } = await pool.query(
      "SELECT participant_id FROM attestations_envoyees WHERE activity_id = $1",
      [id]
    );
    const dejaServis = new Set(dejaRecues.map((r) => r.participant_id));
    const dejaEnvoyees = withEmail.filter((p) => dejaServis.has(p.id)).length;
    const destinataires = withEmail.filter((p) => !dejaServis.has(p.id));

    if (destinataires.length === 0) {
      return res.status(200).json({
        sent: 0,
        skipped: withoutEmail.length,
        deja_envoyees: dejaEnvoyees,
        injoignables,
        message: dejaEnvoyees
          ? `Tout le monde a déjà reçu son attestation pour cette activité (${dejaEnvoyees}).`
          : injoignables.length
            ? `Aucune adresse joignable : ${injoignables.length} adresse(s) invalide(s) ou dont le domaine n'existe pas.`
            : "Aucun participant avec adresse email.",
      });
    }

    let sent = 0;
    const errors = [];

    for (const participant of destinataires) {
      try {
        const pdfBuffer = await attestationPourActivite({ participant, activity, module: intitule });

        const fullName =
          [participant.prenom, participant.nom].filter(Boolean).join(" ") ||
          participant.email;

        const safeName = (activity.title || "activite")
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase();

        const tpl = await getTemplate("attestation");
        const tplVars = {
          nom: fullName,
          activite: intitule,
          date: activity.activity_date ? new Date(activity.activity_date).toLocaleDateString("fr-FR") : "",
          partenaire: activity.partner_name || activity.coach_name || "",
          dispositif: activity.device_name || "",
          duree: activity.duration_hours ? `${activity.duration_hours}h` : "",
        };

        await sendEmail({
          toEmail: participant.email,
          toName: fullName,
          subject: renderTemplate(tpl.subject, tplVars),
          html: renderTemplate(tpl.body_html, tplVars),
          text: `Bonjour ${fullName},\n\nVeuillez trouver ci-joint votre attestation de participation à "${intitule}".\n\n— ODC Sénégal`,
          attachments: [
            {
              filename: `attestation_${safeName}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
            },
          ],
        });

        /* Trace posee apres l'envoi, jamais avant : si l'expedition echoue,
           la personne doit rester dans la liste des restants. */
        await pool.query(
          `INSERT INTO attestations_envoyees (activity_id, participant_id, email, module)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (activity_id, participant_id) DO NOTHING`,
          [id, participant.id, participant.email, intitule]
        );

        sent++;
      } catch (err) {
        console.error(`Attestation error for ${participant.email}:`, err.message);
        errors.push(participant.email);
      }
    }

    res.json({
      sent,
      skipped: withoutEmail.length,
      deja_envoyees: dejaEnvoyees,
      injoignables,
      errors: errors.length > 0 ? errors : undefined,
      message:
        `${sent} attestation(s) envoyée(s)` +
        (dejaEnvoyees > 0 ? `, ${dejaEnvoyees} déjà reçue(s) auparavant` : "") +
        (withoutEmail.length > 0 ? `, ${withoutEmail.length} ignorée(s) (pas d'email)` : "") +
        (injoignables.length > 0 ? `, ${injoignables.length} adresse(s) injoignable(s)` : "") +
        ".",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPLOAD RAPPORT ===== */
router.post("/:id/report", authMiddleware, requireWriteAccess, reportUpload.single("report"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });

    const actRes = await pool.query(
      "SELECT id, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    if (!isOwner(req, actRes.rows[0])) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    await pool.query(
      "UPDATE activities SET report_filename = $1, report_data = $2 WHERE id = $3",
      [req.file.originalname, req.file.buffer, id]
    );
    await computeAndStoreReliability(id).catch((e) => console.warn("Reliability:", e.message));

    res.json({ success: true, filename: req.file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== TÉLÉCHARGER RAPPORT ===== */
router.get("/:id/report", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Sélectionner les métadonnées d'abord pour éviter de charger le BYTEA inutilement
    const metaRes = await pool.query(
      "SELECT report_filename, partner_id, coach_id, octet_length(report_data) AS data_size FROM activities WHERE id = $1",
      [id]
    );
    if (!metaRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    const meta = metaRes.rows[0];
    if (!meta.data_size) return res.status(404).json({ error: "Aucun rapport disponible" });

    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });
    if (!isOwner(req, meta)) return res.status(403).json({ error: "Accès refusé" });

    // Charger les données binaires seulement si autorisé
    const dataRes = await pool.query(
      "SELECT report_data FROM activities WHERE id = $1",
      [id]
    );
    const rawData = dataRes.rows[0]?.report_data;
    if (!rawData) return res.status(404).json({ error: "Aucun rapport disponible" });

    const buffer = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData);

    const filename = meta.report_filename
      ? (meta.report_filename.toLowerCase().endsWith(".pdf") ? meta.report_filename : meta.report_filename + ".pdf")
      : "rapport.pdf";
    const disposition = req.query.inline === "1" ? "inline" : "attachment";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch (err) {
    console.error("[REPORT]", err);
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== SUPPRIMER RAPPORT ===== */
router.delete("/:id/report", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const actRes = await pool.query(
      "SELECT id, title, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    const activity = actRes.rows[0];
    if (!isOwner(req, activity)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    await pool.query(
      "UPDATE activities SET report_filename = NULL, report_data = NULL WHERE id = $1",
      [id]
    );
    await computeAndStoreReliability(id).catch((e) => console.warn("Reliability:", e.message));

    logAudit(req, "UPDATE", "activities", id, activity.title, {
      action: "report_delete",
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[REPORT DELETE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE ACTIVITY ===== */
router.delete("/:id", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      "SELECT id, title, activity_date, partner_id, coach_id FROM activities WHERE id = $1",
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Activite introuvable" });
    }

    if (!isOwner(req, existing.rows[0])) {
      return res.status(403).json({ error: "Acces refuse" });
    }

    const deletedActivity = existing.rows[0];

    // Activités qui pointaient vers celle-ci comme doublon potentiel : leur
    // fiabilité doit être recalculée une fois cette activité supprimée.
    const dependentRes = await pool.query(
      "SELECT id FROM activities WHERE duplicate_of = $1",
      [id]
    );

    const client = await pool.connect();
    let result;
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM activity_participants WHERE activity_id = $1", [id]);
      result = await client.query("DELETE FROM activities WHERE id = $1 RETURNING id", [id]);
      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    logAudit(req, "DELETE", "activities", id, deletedActivity.title, {
      date: deletedActivity.activity_date,
      partner_id: deletedActivity.partner_id,
    });
    for (const dep of dependentRes.rows) {
      await computeAndStoreReliability(dep.id).catch((e) => console.warn("Reliability:", e.message));
    }
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== PHOTOS D'ACTIVITÉ ===== */

/* Liste des métadonnées (sans BYTEA) */
router.get("/:id/photos", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, filename, mime_type, uploaded_by, created_at
       FROM activity_photos WHERE activity_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[PHOTOS LIST]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Upload (plusieurs fichiers) */
router.post("/:id/photos", authMiddleware, requireWriteAccess, photoUpload.array("photos", PHOTO_MAX_PER_ACTIVITY), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: "Aucun fichier" });

    const countRes = await pool.query(
      "SELECT COUNT(*)::int AS total FROM activity_photos WHERE activity_id = $1",
      [req.params.id]
    );
    const current = countRes.rows[0].total;
    const slots = PHOTO_MAX_PER_ACTIVITY - current;

    if (slots <= 0)
      return res.status(400).json({ error: `Limite atteinte : ${PHOTO_MAX_PER_ACTIVITY} photos max par activité.` });

    const filesToInsert = req.files.slice(0, slots);

    const inserted = [];
    for (const file of filesToInsert) {
      const r = await pool.query(
        `INSERT INTO activity_photos (activity_id, filename, mime_type, data, uploaded_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, filename, mime_type, uploaded_by, created_at`,
        [req.params.id, file.originalname, file.mimetype, file.buffer, req.user.id]
      );
      inserted.push(r.rows[0]);
    }
    res.json({ inserted, skipped: req.files.length - filesToInsert.length });
  } catch (err) {
    console.error("[PHOTOS UPLOAD]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Servir une photo (image binaire) */
router.get("/:id/photos/:photoId", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT filename, mime_type, data FROM activity_photos WHERE id = $1 AND activity_id = $2`,
      [req.params.photoId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Photo introuvable" });

    const { filename, mime_type, data } = r.rows[0];
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    res.setHeader("Content-Type", mime_type || "image/jpeg");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buffer);
  } catch (err) {
    console.error("[PHOTO SERVE]", err);
    if (!res.headersSent) res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Supprimer une photo (uploader ou admin) */
router.delete("/:id/photos/:photoId", authMiddleware, requireWriteAccess, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT uploaded_by FROM activity_photos WHERE id = $1 AND activity_id = $2`,
      [req.params.photoId, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Photo introuvable" });

    if (req.user.role !== "admin" && r.rows[0].uploaded_by !== req.user.id)
      return res.status(403).json({ error: "Accès refusé" });

    await pool.query(`DELETE FROM activity_photos WHERE id = $1`, [req.params.photoId]);
    res.json({ success: true });
  } catch (err) {
    console.error("[PHOTO DELETE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
