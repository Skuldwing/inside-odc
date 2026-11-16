const express = require("express");
const multer = require("multer");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = String(file.originalname || "").split(".").pop().toLowerCase();
    const allowed = {
      pdf: ["application/pdf"],
      doc: ["application/msword", "application/octet-stream"],
      docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
      xls: ["application/vnd.ms-excel", "application/octet-stream"],
      xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
      ppt: ["application/vnd.ms-powerpoint", "application/octet-stream"],
      pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream"],
      csv: ["text/csv", "application/vnd.ms-excel", "application/octet-stream"],
      txt: ["text/plain", "application/octet-stream"],
      png: ["image/png"],
      jpg: ["image/jpeg"],
      jpeg: ["image/jpeg"],
    };
    const mimeTypes = allowed[extension];
    if (!mimeTypes || !mimeTypes.includes(file.mimetype)) {
      return callback(Object.assign(new Error("Format non accepté. Utilisez PDF, Word, Excel, PowerPoint, CSV, TXT ou une image PNG/JPEG."), { status: 400 }));
    }
    callback(null, true);
  },
});

let schemaPromise;
async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS goto27_documents (
        id SERIAL PRIMARY KEY,
        partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        file_data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => pool.query("ALTER TABLE partners ADD COLUMN IF NOT EXISTS goto27_hidden BOOLEAN NOT NULL DEFAULT FALSE")).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function autoriserAdminOuPartenaire(req, res, next) {
  if (req.user?.role !== "admin" && req.user?.role !== "partner") {
    return res.status(403).json({ error: "Accès réservé aux administrateurs et aux partenaires." });
  }
  if (req.user.role === "partner" && (!Number.isInteger(Number(req.user.partner_id)) || Number(req.user.partner_id) < 1)) {
    return res.status(403).json({ error: "Aucun partenaire n'est associé à ce compte." });
  }
  next();
}

function recevoirFichier(req, res, next) {
  upload.single("file")(req, res, (error) => {
    if (!error) return next();
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Le fichier dépasse la limite de 25 Mo." });
    }
    return res.status(400).json({ error: error.message || "Le fichier n'a pas pu être lu." });
  });
}

router.use(authMiddleware, autoriserAdminOuPartenaire);

router.get("/partners", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Accès réservé à l'administrateur." });
  try {
    await ensureSchema();
    const result = await pool.query(
      `SELECT p.id, p.name, p.goto27_hidden, COUNT(DISTINCT d.id)::int AS documents_count,
              COALESCE((array_agg(member_list.accounts))[1], '[]'::json) AS accounts
       FROM partners p
       LEFT JOIN goto27_documents d ON d.partner_id = p.id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email)
                         ORDER BY COALESCE(u.full_name, u.email)) AS accounts
         FROM users u WHERE u.partner_id = p.id AND u.role = 'partner'
       ) member_list ON TRUE
       GROUP BY p.id, p.name
       ORDER BY p.name`
    );
    res.json(result.rows);
  } catch (error) {
    if (error.code !== "42P01" && error.code !== "42703") {
      console.error("[GOTO27 PARTNERS]", error);
      return res.status(500).json({ error: "Impossible de charger les partenaires." });
    }
    try {
      await ensureSchema();
      const result = await pool.query(
        `SELECT p.id, p.name, p.goto27_hidden, COUNT(DISTINCT d.id)::int AS documents_count,
                COALESCE((array_agg(member_list.accounts))[1], '[]'::json) AS accounts
         FROM partners p LEFT JOIN goto27_documents d ON d.partner_id = p.id
         LEFT JOIN LATERAL (
           SELECT json_agg(json_build_object('id', u.id, 'full_name', u.full_name, 'email', u.email)
                           ORDER BY COALESCE(u.full_name, u.email)) AS accounts
           FROM users u WHERE u.partner_id = p.id AND u.role = 'partner'
         ) member_list ON TRUE
         GROUP BY p.id, p.name ORDER BY p.name`
      );
      res.json(result.rows);
    } catch (retryError) {
      console.error("[GOTO27 PARTNERS]", retryError);
      res.status(500).json({ error: "Impossible de charger les partenaires." });
    }
  }
});

router.patch("/partners/:id/visibility", async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Action réservée à l'administrateur." });
  const hidden = req.body?.hidden === true;
  try {
    await ensureSchema();
    const result = await pool.query(
      "UPDATE partners SET goto27_hidden = $1 WHERE id = $2 RETURNING id, name, goto27_hidden",
      [hidden, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Partenaire introuvable." });
    logAudit(req, "UPDATE", "partners", result.rows[0].id, result.rows[0].name, { goto27_hidden: hidden });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("[GOTO27 PARTNER VISIBILITY]", error);
    res.status(500).json({ error: "Impossible de modifier la visibilité GOTO27." });
  }
});

router.get("/documents", async (req, res) => {
  try {
    await ensureSchema();
    const values = [];
    let partnerClause = "";
    if (req.user.role === "partner") {
      values.push(Number(req.user.partner_id));
      partnerClause = `WHERE d.partner_id = $${values.length} AND p.goto27_hidden = FALSE`;
    } else if (req.query.partner_id) {
      const partnerId = Number(req.query.partner_id);
      if (!Number.isInteger(partnerId) || partnerId < 1) return res.status(400).json({ error: "Partenaire invalide." });
      values.push(partnerId);
      partnerClause = `WHERE d.partner_id = $${values.length}`;
    }
    const result = await pool.query(
      `SELECT d.id, d.partner_id, p.name AS partner_name, d.uploaded_by,
              COALESCE(u.full_name, u.email, 'Compte supprimé') AS uploader_name,
              d.title, d.description, d.filename, d.mime_type, d.file_size,
              d.created_at, d.updated_at
       FROM goto27_documents d
       JOIN partners p ON p.id = d.partner_id
       LEFT JOIN users u ON u.id = d.uploaded_by
       ${partnerClause}
       ORDER BY d.created_at DESC, d.id DESC`,
      values
    );
    res.json(result.rows);
  } catch (error) {
    console.error("[GOTO27 LIST]", error);
    res.status(500).json({ error: "Impossible de charger les documents." });
  }
});

router.post("/documents", recevoirFichier, async (req, res) => {
  try {
    await ensureSchema();
    if (!req.file) return res.status(400).json({ error: "Sélectionnez un fichier à déposer." });
    const partnerId = req.user.role === "admin" ? Number(req.body.partner_id) : Number(req.user.partner_id);
    if (!Number.isInteger(partnerId) || partnerId < 1) return res.status(400).json({ error: "Sélectionnez un partenaire." });
    const partnerExists = await pool.query("SELECT goto27_hidden FROM partners WHERE id = $1", [partnerId]);
    if (!partnerExists.rowCount) return res.status(400).json({ error: "Partenaire introuvable." });
    if (req.user.role === "partner" && partnerExists.rows[0].goto27_hidden) {
      return res.status(403).json({ error: "Cet espace partenaire est masqué dans GOTO27." });
    }
    const title = String(req.body.title || req.file.originalname).trim().slice(0, 180);
    const description = String(req.body.description || "").trim().slice(0, 2000) || null;
    if (!title) return res.status(400).json({ error: "Le titre du document est requis." });

    const result = await pool.query(
      `INSERT INTO goto27_documents
       (partner_id, uploaded_by, title, description, filename, mime_type, file_size, file_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, partner_id, title, filename, created_at`,
      [partnerId, req.user.id, title, description, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
    );
    const document = result.rows[0];
    logAudit(req, "CREATE", "goto27_documents", document.id, document.title, { partner_id: partnerId, filename: document.filename });
    res.status(201).json(document);
  } catch (error) {
    console.error("[GOTO27 CREATE]", error);
    res.status(500).json({ error: "Impossible d'enregistrer le document." });
  }
});

router.get("/documents/:id/download", async (req, res) => {
  try {
    await ensureSchema();
    const values = [req.params.id];
    const accessClause = req.user.role === "partner" ? "AND partner_id = $2 AND EXISTS (SELECT 1 FROM partners p WHERE p.id = goto27_documents.partner_id AND p.goto27_hidden = FALSE)" : "";
    if (req.user.role === "partner") values.push(Number(req.user.partner_id));
    const result = await pool.query(
      `SELECT filename, mime_type, file_data FROM goto27_documents WHERE id = $1 ${accessClause}`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: "Document introuvable." });
    const document = result.rows[0];
    res.setHeader("Content-Type", document.mime_type || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.attachment(document.filename);
    res.send(document.file_data);
  } catch (error) {
    console.error("[GOTO27 DOWNLOAD]", error);
    res.status(500).json({ error: "Impossible de télécharger ce document." });
  }
});

router.put("/documents/:id", recevoirFichier, async (req, res) => {
  try {
    await ensureSchema();
    const title = String(req.body.title || "").trim().slice(0, 180);
    const description = String(req.body.description || "").trim().slice(0, 2000) || null;
    if (!title) return res.status(400).json({ error: "Le titre du document est requis." });
    const values = [title, description];
    let fileAssignments = "";
    if (req.file) {
      values.push(req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer);
      fileAssignments = `, filename = $3, mime_type = $4, file_size = $5, file_data = $6`;
    }
    values.push(req.params.id);
    let idParameter = values.length;
    let partnerClause = "";
    if (req.user.role === "partner") {
      values.push(Number(req.user.partner_id));
      partnerClause = ` AND partner_id = $${values.length} AND EXISTS (SELECT 1 FROM partners p WHERE p.id = goto27_documents.partner_id AND p.goto27_hidden = FALSE)`;
    }
    const result = await pool.query(
      `UPDATE goto27_documents SET title = $1, description = $2${fileAssignments}, updated_at = NOW()
       WHERE id = $${idParameter}${partnerClause}
       RETURNING id, partner_id, title, filename, updated_at`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: "Document introuvable." });
    logAudit(req, "UPDATE", "goto27_documents", result.rows[0].id, result.rows[0].title, { filename: result.rows[0].filename });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("[GOTO27 UPDATE]", error);
    res.status(500).json({ error: "Impossible de modifier le document." });
  }
});

router.delete("/documents/:id", async (req, res) => {
  try {
    await ensureSchema();
    const values = [req.params.id];
    const partnerClause = req.user.role === "partner" ? "AND partner_id = $2 AND EXISTS (SELECT 1 FROM partners p WHERE p.id = goto27_documents.partner_id AND p.goto27_hidden = FALSE)" : "";
    if (req.user.role === "partner") values.push(Number(req.user.partner_id));
    const result = await pool.query(
      `DELETE FROM goto27_documents WHERE id = $1 ${partnerClause} RETURNING id, title, partner_id`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: "Document introuvable." });
    logAudit(req, "DELETE", "goto27_documents", result.rows[0].id, result.rows[0].title, { partner_id: result.rows[0].partner_id });
    res.json({ success: true });
  } catch (error) {
    console.error("[GOTO27 DELETE]", error);
    res.status(500).json({ error: "Impossible de supprimer ce document." });
  }
});

module.exports = router;
