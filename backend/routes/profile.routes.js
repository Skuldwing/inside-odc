const express = require("express");
const multer = require("multer");
const bcrypt = require("bcrypt");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const { ensureProfileSchema, estSchemaManquant } = require("../migrations/profileSchema");

const router = express.Router();

/**
 * Execute une requete, et si le schema du profil manque encore, le cree puis
 * reessaie une fois.
 *
 * Les migrations de demarrage ne sont pas attendues et n'echouent qu'en
 * avertissement console : sans ce filet, une migration qui n'est pas passee
 * condamne la page Profil silencieusement et definitivement. Un seul essai
 * supplementaire — si la seconde tentative echoue, l'erreur remonte.
 */
async function avecSchema(operation) {
  try {
    return await operation();
  } catch (err) {
    if (!estSchemaManquant(err)) throw err;
    console.warn("[PROFIL] schema absent, creation puis nouvel essai :", err.message);
    await ensureProfileSchema();
    return operation();
  }
}

/* La photo est redimensionnee par le navigateur avant l'envoi ; cette limite
   n'est qu'un garde-fou contre un client qui ne le ferait pas. */
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpeg|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Formats acceptés : PNG, JPEG, WebP"));
  },
});

/* Champs que chacun peut modifier sur son propre compte. Le role, le
   partenaire et l'email n'en font pas partie : ils definissent les droits et
   restent la main de l'administrateur. */
const PROFILE_FIELDS = `
  u.id, u.email, u.full_name, u.job_title, u.phone, u.bio, u.role,
  u.partner_id, COALESCE(u.is_team_odc, false) AS is_team_odc,
  u.avatar_updated_at, u.created_at, u.last_seen_at
`;

async function readProfile(userId) {
  const res = await pool.query(
    `SELECT ${PROFILE_FIELDS}, p.name AS partner_name
     FROM users u
     LEFT JOIN partners p ON p.id = u.partner_id
     WHERE u.id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

/* ===== MON PROFIL ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const profile = await avecSchema(() => readProfile(req.user.id));
    if (!profile) return res.status(404).json({ error: "Compte introuvable" });
    res.json(profile);
  } catch (err) {
    console.error("[PROFIL]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MISE A JOUR ===== */
router.put("/", authMiddleware, async (req, res) => {
  try {
    const clean = (v, max) => {
      if (v === undefined || v === null) return null;
      const text = String(v).trim();
      return text ? text.slice(0, max) : null;
    };

    const full_name = clean(req.body.full_name, 120);
    if (!full_name) {
      return res.status(400).json({ error: "Le nom complet est obligatoire" });
    }

    const result = await avecSchema(() => pool.query(
      `UPDATE users
       SET full_name = $1, job_title = $2, phone = $3, bio = $4
       WHERE id = $5
       RETURNING id`,
      [
        full_name,
        clean(req.body.job_title, 120),
        clean(req.body.phone, 40),
        clean(req.body.bio, 500),
        req.user.id,
      ]
    ));
    if (!result.rowCount) return res.status(404).json({ error: "Compte introuvable" });

    logAudit(req, "UPDATE", "profil", req.user.id, full_name, { champs: "informations" });
    res.json(await avecSchema(() => readProfile(req.user.id)));
  } catch (err) {
    console.error("[PROFIL]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== PHOTO ===== */
router.post("/avatar", authMiddleware, (req, res) => {
  avatarUpload.single("avatar")(req, res, async (uploadErr) => {
    /* multer signale ici un fichier trop lourd ou d'un format refuse : sans ce
       relais, l'erreur remonterait en 500 sans explication utilisable. */
    if (uploadErr) {
      const message =
        uploadErr.code === "LIMIT_FILE_SIZE"
          ? "Image trop lourde (2 Mo maximum)"
          : uploadErr.message || "Image refusée";
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Aucune image reçue" });

    try {
      const now = new Date();
      await avecSchema(() => pool.query(
        `INSERT INTO user_avatars (user_id, mime, data, updated_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id)
         DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [req.user.id, req.file.mimetype, req.file.buffer, now]
      ));
      await pool.query(`UPDATE users SET avatar_updated_at = $1 WHERE id = $2`, [now, req.user.id]);

      logAudit(req, "UPDATE", "profil", req.user.id, req.user.email, { champs: "photo" });
      res.json({ avatar_updated_at: now.toISOString() });
    } catch (err) {
      console.error("[PROFIL AVATAR]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });
});

router.delete("/avatar", authMiddleware, async (req, res) => {
  try {
    await avecSchema(() =>
      pool.query(`DELETE FROM user_avatars WHERE user_id = $1`, [req.user.id])
    );
    await pool.query(`UPDATE users SET avatar_updated_at = NULL WHERE id = $1`, [req.user.id]);
    logAudit(req, "DELETE", "profil", req.user.id, req.user.email, { champs: "photo" });
    res.json({ success: true });
  } catch (err) {
    console.error("[PROFIL AVATAR]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* La photo de n'importe quel membre est lisible par une personne connectee :
   elle s'affiche a cote des taches Mbootay et des activites. */
router.get("/avatar/:userId", authMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Identifiant invalide" });

    const result = await avecSchema(() =>
      pool.query(`SELECT mime, data, updated_at FROM user_avatars WHERE user_id = $1`, [userId])
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "Aucune photo" });

    /* L'URL portant l'horodatage de la derniere modification, le contenu ne
       peut plus changer sous une meme adresse : on autorise un cache long. */
    res.setHeader("Content-Type", row.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("ETag", `"${userId}-${new Date(row.updated_at).getTime()}"`);
    if (req.headers["if-none-match"] === res.getHeader("ETag")) return res.status(304).end();
    res.send(row.data);
  } catch (err) {
    console.error("[PROFIL AVATAR]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MOT DE PASSE ===== */
router.post("/password", authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis" });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: "Le nouveau mot de passe doit faire au moins 8 caractères" });
    }

    const result = await pool.query(`SELECT password FROM users WHERE id = $1`, [req.user.id]);
    const hash = result.rows[0]?.password;
    if (!hash) return res.status(404).json({ error: "Compte introuvable" });

    const ok = await bcrypt.compare(String(current_password), hash);
    if (!ok) return res.status(400).json({ error: "Mot de passe actuel incorrect" });

    await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [
      await bcrypt.hash(String(new_password), 10),
      req.user.id,
    ]);

    logAudit(req, "UPDATE", "profil", req.user.id, req.user.email, { champs: "mot de passe" });
    res.json({ success: true });
  } catch (err) {
    console.error("[PROFIL MOT DE PASSE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
