const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { sendEmail } = require("../services/mail");
const { createPasswordToken } = require("../services/passwordReset");
const { getTemplate, renderTemplate } = require("./emailTemplates.routes");
const requireAdminPin = require("../middleware/pin.middleware");
const crypto = require("crypto");
const { logAudit } = require("../services/audit");
const { ensureCoachDevicesSchema, tableAbsente } = require("../migrations/coachDevices");

const router = express.Router();

/* Liste des coachs, pour le selecteur du formulaire d'activite.
   Declaree avant le verrou ci-dessous : exiger le PIN administrateur pour
   remplir une liste deroulante empecherait de creer une activite tant qu'il
   n'a pas ete saisi. Elle ne renvoie que le nom et l'identifiant. */
router.get("/coaches", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email
       FROM users
       WHERE role = 'coach' AND COALESCE(is_active, true) = true
       ORDER BY full_name NULLS LAST, email`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[COACHS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.use(authMiddleware, requireAdmin, requireAdminPin);

/* Remplace la liste des dispositifs confies a un coach.
   Seul ce role en porte : un partenaire tient les siens par partner_devices,
   un lecteur n'en a pas l'usage. Si la table manque encore — migration de
   demarrage non passee — on la cree puis on reessaie. */
async function remplacerDispositifsCoach(userId, role, deviceIds) {
  if (role !== "coach") {
    await pool.query("DELETE FROM user_devices WHERE user_id = $1", [userId]);
    return [];
  }

  const ids = Array.isArray(deviceIds)
    ? [...new Set(deviceIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  await pool.query("DELETE FROM user_devices WHERE user_id = $1", [userId]);
  if (ids.length) {
    const valeurs = ids.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO user_devices (user_id, device_id) VALUES ${valeurs}
       ON CONFLICT DO NOTHING`,
      [userId, ...ids]
    );
  }
  return ids;
}

async function enregistrerDispositifsCoach(userId, role, deviceIds) {
  try {
    return await remplacerDispositifsCoach(userId, role, deviceIds);
  } catch (err) {
    if (!tableAbsente(err)) throw err;
    console.warn("[UTILISATEURS] table user_devices absente, creation puis nouvel essai");
    await ensureCoachDevicesSchema();
    return remplacerDispositifsCoach(userId, role, deviceIds);
  }
}

/* La liste des utilisateurs joint desormais user_devices : si la table manque,
   c'est toute la page Utilisateurs qui tombe, pas seulement les dispositifs.
   On la cree et on reessaie une fois. */
async function avecTableDispositifs(operation) {
  try {
    return await operation();
  } catch (err) {
    if (!tableAbsente(err)) throw err;
    console.warn("[UTILISATEURS] table user_devices absente, creation puis nouvel essai");
    await ensureCoachDevicesSchema();
    return operation();
  }
}

async function hasUsersIsActiveColumn() {
  const result = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'users' AND column_name = 'is_active' LIMIT 1`
  );
  return result.rowCount > 0;
}


/* ===== GET USERS ===== */
router.get("/", async (req, res) => {
  try {
    const hasIsActive = await hasUsersIsActiveColumn();
    const statusExpr = hasIsActive
      ? "CASE WHEN u.is_active = true THEN 'active' ELSE 'inactive' END"
      : "'active'";

    const result = await avecTableDispositifs(() => pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.partner_id,
              u.objective_beneficiaries,
              u.last_seen_at,
              COALESCE(u.is_team_odc, false) AS is_team_odc,
              p.name AS partner,
              ${statusExpr} AS status,
              COALESCE(ud.device_ids, ARRAY[]::int[])   AS device_ids,
              COALESCE(ud.device_names, ARRAY[]::text[]) AS device_names
       FROM users u
       LEFT JOIN partners p ON u.partner_id = p.id
       LEFT JOIN (
         SELECT ud.user_id,
                array_agg(d.id  ORDER BY d.name) AS device_ids,
                array_agg(d.name ORDER BY d.name) AS device_names
         FROM user_devices ud
         JOIN devices d ON d.id = ud.device_id
         GROUP BY ud.user_id
       ) ud ON ud.user_id = u.id
       ORDER BY u.created_at DESC`
    ));
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATE USER ===== */
router.post("/", async (req, res) => {
  try {
    const {
      full_name,
      email,
      role = "viewer",
      partner_id = null,
      partner = null,
      status = "active",
      is_team_odc = false,
      device_ids = [],
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email requis" });
    }

    // L'acces Mbootay est reserve aux profils internes : jamais un partenaire.
    const teamOdc = role !== "partner" && Boolean(is_team_odc);

    let resolvedPartnerId = partner_id || null;
    if (!resolvedPartnerId && partner) {
      const partnerResult = await pool.query(
        "SELECT id FROM partners WHERE name = $1",
        [partner]
      );
      resolvedPartnerId = partnerResult.rows[0]?.id || null;
    }

    const tempPassword = crypto.randomBytes(24).toString("hex");
    const hash = await bcrypt.hash(tempPassword, 10);
    const isActive = status !== "inactive";
    const hasIsActive = await hasUsersIsActiveColumn();

    const result = hasIsActive
      ? await pool.query(
          `
          INSERT INTO users (email, password, role, partner_id, full_name, is_active, is_team_odc)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          RETURNING id, email, role, full_name, partner_id, is_team_odc
          `,
          [email, hash, role, resolvedPartnerId, full_name || null, isActive, teamOdc]
        )
      : await pool.query(
          `
          INSERT INTO users (email, password, role, partner_id, full_name, is_team_odc)
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING id, email, role, full_name, partner_id, is_team_odc
          `,
          [email, hash, role, resolvedPartnerId, full_name || null, teamOdc]
        );

    const createdUser = result.rows[0];
    createdUser.device_ids = await enregistrerDispositifsCoach(
      createdUser.id, createdUser.role, device_ids
    );

    let inviteLink = null;
    try {
      const appUrl = process.env.APP_BASE_URL || "https://inside-odc.vercel.app";
      const token = await createPasswordToken(createdUser.id);
      const link = `${appUrl}/set-password?token=${token}`;
      inviteLink = link;

      const tpl = await getTemplate("welcome");
      const vars = { nom: full_name || email, email, lien: link };
      await sendEmail({
        toEmail: email,
        toName: full_name || email,
        subject: renderTemplate(tpl.subject, vars),
        html: renderTemplate(tpl.body_html, vars),
        text: `Bonjour ${full_name || email}\nDéfinir le mot de passe: ${link}\nCe lien est valable 24h.`,
      });
    } catch (err) {
      console.error("Erreur envoi email création utilisateur", err);
    }

    logAudit(req, "CREATE", "users", createdUser.id, createdUser.full_name || email, {
      email: createdUser.email,
      role: createdUser.role,
    });
    res.status(201).json({ ...createdUser, invite_link: inviteLink });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== UPDATE USER ===== */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name,
      email,
      role,
      partner_id = null,
      partner = null,
      status = "active",
      objective_beneficiaries = null,
      is_team_odc = false,
      device_ids = [],
    } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email requis" });
    }

    // L'acces Mbootay est reserve aux profils internes : jamais un partenaire.
    const teamOdc = role !== "partner" && Boolean(is_team_odc);

    let resolvedPartnerId = partner_id || null;
    if (!resolvedPartnerId && partner) {
      const partnerResult = await pool.query(
        "SELECT id FROM partners WHERE name = $1",
        [partner]
      );
      resolvedPartnerId = partnerResult.rows[0]?.id || null;
    }

    const isActive = status !== "inactive";

    const coachObjective = role === "coach" && objective_beneficiaries !== null && objective_beneficiaries !== ""
      ? Number(objective_beneficiaries)
      : null;

    const hasIsActive = await hasUsersIsActiveColumn();

    const result = hasIsActive
      ? await pool.query(
          `UPDATE users
           SET email = $1, role = $2, partner_id = $3, full_name = $4,
               is_active = $5, objective_beneficiaries = $6, is_team_odc = $7
           WHERE id = $8
           RETURNING id, email, role, full_name, partner_id, objective_beneficiaries, is_team_odc`,
          [email, role, resolvedPartnerId, full_name || null, isActive, coachObjective, teamOdc, id]
        )
      : await pool.query(
          `UPDATE users
           SET email = $1, role = $2, partner_id = $3, full_name = $4,
               objective_beneficiaries = $5, is_team_odc = $6
           WHERE id = $7
           RETURNING id, email, role, full_name, partner_id, objective_beneficiaries, is_team_odc`,
          [email, role, resolvedPartnerId, full_name || null, coachObjective, teamOdc, id]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const updatedUser = result.rows[0];
    updatedUser.device_ids = await enregistrerDispositifsCoach(
      updatedUser.id, updatedUser.role, device_ids
    );

    logAudit(req, "UPDATE", "users", updatedUser.id, updatedUser.full_name || updatedUser.email, {
      email: updatedUser.email,
      role: updatedUser.role,
      status,
      is_team_odc: updatedUser.is_team_odc,
    });
    res.json(updatedUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== DELETE (DEACTIVATE) USER ===== */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const targetUser = await pool.query("SELECT id, full_name, email, role FROM users WHERE id = $1", [id]);
    const hasIsActive = await hasUsersIsActiveColumn();
    const result = hasIsActive
      ? await pool.query(
          `
          UPDATE users
          SET is_active = false
          WHERE id = $1
          RETURNING id
          `,
          [id]
        )
      : await pool.query(
          `
          DELETE FROM users
          WHERE id = $1
          RETURNING id
          `,
          [id]
        );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const tu = targetUser.rows[0];
    if (tu) {
      logAudit(req, "DELETE", "users", id, tu.full_name || tu.email, {
        email: tu.email,
        role: tu.role,
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== HARD DELETE USER ===== */
router.delete("/:id/hard-delete", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `
      DELETE FROM users
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== RESET PASSWORD ===== */
router.post("/:id/reset-password", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT id, email, full_name
      FROM users
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const user = result.rows[0];

    if (!process.env.BREVO_API_KEY && !process.env.SMTP_HOST) {
      return res.status(503).json({ error: "Email non configuré. Ajoutez BREVO_API_KEY dans les variables Railway." });
    }

    const appUrl = process.env.APP_BASE_URL || "https://inside-odc.vercel.app";
    const token = await createPasswordToken(user.id);
    const link = `${appUrl}/set-password?token=${token}`;

    const tpl = await getTemplate("reset_password");
    const vars = { nom: user.full_name || user.email, lien: link };
    await sendEmail({
      toEmail: user.email,
      toName: user.full_name || user.email,
      subject: renderTemplate(tpl.subject, vars),
      html: renderTemplate(tpl.body_html, vars),
      text: `Bonjour ${user.full_name || user.email}\nLien de réinitialisation: ${link}\nCe lien est valable 24h.`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GENERATE RESET LINK ===== */
router.post("/:id/reset-link", async (req, res) => {
  try {
    const { id } = req.params;
    const userRes = await pool.query(
      "SELECT id, full_name, email FROM users WHERE id = $1",
      [id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    const appUrl = process.env.APP_BASE_URL || "https://inside-odc.vercel.app";
    const token = await createPasswordToken(id);
    const link = `${appUrl}/set-password?token=${token}`;

    res.json({ link, full_name: userRes.rows[0].full_name, email: userRes.rows[0].email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
