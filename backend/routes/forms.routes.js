const express = require("express");
const XLSX = require("xlsx");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();

const ALLOWED_FIELD_TYPES = new Set([
  "text",
  "email",
  "phone",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
  "rating",
  "separator",
]);
const ALLOWED_CONDITION_OPERATORS = new Set(["eq", "neq", "contains"]);
const DEFAULT_SETTINGS = {
  primary_color: "#0f766e",
  logo_url: "",
  header_image_url: "",
  open_at: null,
  close_at: null,
  submit_label: "Envoyer",
  success_message: "Merci, votre reponse a ete enregistree.",
  redirect_url: "",
  max_submissions: 0,
  one_per_email: false,
  notification_email: "",
};

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function createUniqueSlug(client, title, formIdToIgnore = null) {
  const base = slugify(title) || "formulaire";
  let candidate = base;
  let suffix = 1;

  while (true) {
    const result = await client.query(
      `
      SELECT 1
      FROM forms
      WHERE slug = $1
      ${formIdToIgnore ? "AND id <> $2" : ""}
      LIMIT 1
      `,
      formIdToIgnore ? [candidate, formIdToIgnore] : [candidate]
    );
    if (result.rowCount === 0) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

function sanitizeShowIf(showIf) {
  if (!showIf || typeof showIf !== "object" || Array.isArray(showIf)) return null;
  const key = String(showIf.key || "").trim();
  const operator = String(showIf.operator || "eq").toLowerCase().trim();
  if (!key || !ALLOWED_CONDITION_OPERATORS.has(operator)) return null;

  let value = showIf.value;
  if (typeof value === "string") value = value.trim();
  else if (typeof value === "number" || typeof value === "boolean") value = value;
  else if (value === null || value === undefined) value = "";
  else value = String(value);

  return { key, operator, value };
}

function sanitizeSettings(input) {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(input && typeof input === "object" && !Array.isArray(input) ? input : {}),
  };

  const primary_color = String(merged.primary_color || "").trim().toLowerCase();
  const logo_url = String(merged.logo_url || "").trim();
  const header_image_url = String(merged.header_image_url || "").trim();
  const submit_label = String(merged.submit_label || "").trim();
  const success_message = String(merged.success_message || "").trim();
  const redirect_url = String(merged.redirect_url || "").trim();
  const notification_email = String(merged.notification_email || "").trim();
  const openDate = merged.open_at ? new Date(merged.open_at) : null;
  const closeDate = merged.close_at ? new Date(merged.close_at) : null;
  const open_at = openDate && !Number.isNaN(openDate.getTime()) ? openDate.toISOString() : null;
  const close_at = closeDate && !Number.isNaN(closeDate.getTime()) ? closeDate.toISOString() : null;
  const max_submissions = Math.max(0, Math.floor(Number(merged.max_submissions) || 0));
  const one_per_email = Boolean(merged.one_per_email);

  return {
    primary_color: /^#[0-9a-f]{6}$/.test(primary_color)
      ? primary_color
      : DEFAULT_SETTINGS.primary_color,
    logo_url: logo_url || "",
    header_image_url: header_image_url || "",
    open_at,
    close_at,
    submit_label: submit_label || DEFAULT_SETTINGS.submit_label,
    success_message: success_message || DEFAULT_SETTINGS.success_message,
    redirect_url: redirect_url || "",
    max_submissions,
    one_per_email,
    notification_email: notification_email || "",
  };
}

function isFormOpen(settings) {
  const now = Date.now();
  const openAt = settings?.open_at ? Date.parse(settings.open_at) : null;
  const closeAt = settings?.close_at ? Date.parse(settings.close_at) : null;
  if (Number.isFinite(openAt) && now < openAt) {
    return {
      ok: false,
      error: `Ce formulaire ouvrira le ${new Date(openAt).toLocaleString("fr-FR")}.`,
    };
  }
  if (Number.isFinite(closeAt) && now > closeAt) {
    return {
      ok: false,
      error: `Ce formulaire est ferme depuis le ${new Date(closeAt).toLocaleString("fr-FR")}.`,
    };
  }
  return { ok: true };
}

function sanitizeFields(inputFields) {
  if (!Array.isArray(inputFields)) return [];

  const fields = inputFields
    .map((field, idx) => {
      const type = String(field?.type || "").toLowerCase().trim();
      if (!ALLOWED_FIELD_TYPES.has(type)) return null;

      const label = String(field?.label || "").trim();
      if (!label) return null;

      // Les séparateurs sont des éléments visuels : clé autogénérée, pas de validation
      if (type === "separator") {
        return { key: `sep_${idx + 1}`, label, type, required: false, options: [], page: Math.max(1, Math.floor(Number(field?.page) || 1)), show_if: null };
      }

      const keyRaw = String(field?.key || "").trim();
      const key = slugify(keyRaw || label).replace(/-/g, "_") || `field_${idx + 1}`;
      const required = Boolean(field?.required);
      const placeholder = String(field?.placeholder || "").trim();
      const options = Array.isArray(field?.options)
        ? field.options.map((o) => String(o || "").trim()).filter(Boolean).slice(0, 100)
        : [];
      const pageValue = Number(field?.page);
      const page = Number.isFinite(pageValue) && pageValue >= 1 ? Math.floor(pageValue) : 1;
      const show_if = sanitizeShowIf(field?.show_if);

      return {
        key,
        label,
        type,
        required,
        placeholder: placeholder || null,
        options: (type === "select" || type === "checkbox") ? options : [],
        page,
        show_if,
      };
    })
    .filter(Boolean);

  // Dédoublonnage sur la clé (sauf separators qui peuvent se répéter)
  const dedup = [];
  const seen = new Set();
  for (const field of fields) {
    if (field.type === "separator") { dedup.push(field); continue; }
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    dedup.push(field);
  }
  return dedup;
}

function sanitizeStatus(value) {
  const status = String(value || "draft").toLowerCase().trim();
  return status === "active" ? "active" : "draft";
}

function sanitizeSubmissionValues(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    const key = String(k || "").trim();
    if (!key) continue;
    if (typeof v === "string") out[key] = v.trim();
    else if (typeof v === "number" || typeof v === "boolean") out[key] = v;
    else if (Array.isArray(v)) out[key] = v.map((item) => String(item || "").trim());
    else out[key] = String(v ?? "").trim();
  }
  return out;
}

function normalizeFieldKey(value) {
  return slugify(String(value || "")).replace(/-/g, "_");
}

function getSubmissionValueByFieldKey(values, key) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return undefined;
  if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
  const normalizedKey = normalizeFieldKey(key);
  if (!normalizedKey) return undefined;
  for (const [entryKey, entryValue] of Object.entries(values)) {
    if (normalizeFieldKey(entryKey) === normalizedKey) return entryValue;
  }
  return undefined;
}

function normalizeComparable(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function isConditionMatch(condition, values) {
  if (!condition || typeof condition !== "object") return true;
  const source = values[condition.key];
  const target = normalizeComparable(condition.value);

  if (Array.isArray(source)) {
    const sourceValues = source.map((item) => normalizeComparable(item));
    if (condition.operator === "eq") return sourceValues.includes(target);
    if (condition.operator === "neq") return !sourceValues.includes(target);
    if (condition.operator === "contains") {
      const targetText = String(target).toLowerCase();
      return sourceValues.some((item) => String(item).toLowerCase().includes(targetText));
    }
    return true;
  }

  const sourceValue = normalizeComparable(source);
  if (condition.operator === "eq") return sourceValue === target;
  if (condition.operator === "neq") return sourceValue !== target;
  if (condition.operator === "contains") {
    return String(sourceValue).toLowerCase().includes(String(target).toLowerCase());
  }
  return true;
}

function isFieldVisible(field, values) {
  return isConditionMatch(field?.show_if, values);
}

function isMissingRequiredValue(field, value) {
  const isMulti = field?.type === "checkbox" && Array.isArray(field?.options) && field.options.length > 0;
  if (isMulti) return !Array.isArray(value) || value.length === 0;
  if (field?.type === "checkbox") return value !== true;
  return value === undefined || value === null || value === "";
}

function buildExportRows(fields, submissions) {
  const orderedFields = [...fields]
    .sort((a, b) => Number(a?.page || 1) - Number(b?.page || 1))
    .map((field, idx) => {
      if (field?.type === "separator") return null;
      const key = String(field?.key || "").trim();
      const label = String(field?.label || "").trim();
      if (!key) return null;
      return { key, label: label || `Champ ${idx + 1}`, column: `${label || `Champ ${idx + 1}`} (${key})` };
    })
    .filter(Boolean);

  const knownKeySet = new Set(orderedFields.map((field) => field.key));
  const extraKeysSet = new Set();
  for (const submission of submissions) {
    const values = submission?.values && typeof submission.values === "object" ? submission.values : {};
    for (const key of Object.keys(values)) {
      if (!knownKeySet.has(key)) extraKeysSet.add(key);
    }
  }
  const extraKeys = Array.from(extraKeysSet).sort((a, b) => a.localeCompare(b));

  const rows = [];
  for (const submission of submissions) {
    const values = submission?.values && typeof submission.values === "object" ? submission.values : {};
    const row = {
      submission_id: submission.id,
      submitted_at: submission.submitted_at,
      source: submission.source || "",
      ip: submission.ip || "",
    };
    for (const field of orderedFields) {
      const value = getSubmissionValueByFieldKey(values, field.key);
      if (Array.isArray(value)) row[field.column] = value.join(" | ");
      else if (value === undefined || value === null) row[field.column] = "";
      else row[field.column] = String(value);
    }
    for (const key of extraKeys) {
      const value = values[key];
      const column = `Extra (${key})`;
      if (Array.isArray(value)) row[column] = value.join(" | ");
      else if (value === undefined || value === null) row[column] = "";
      else row[column] = String(value);
    }
    rows.push(row);
  }
  return rows;
}

/* ===== PUBLIC ===== */
router.get("/public/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await pool.query(
      `SELECT id, title, description, slug, fields, settings, status FROM forms WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    const form = result.rows[0];
    if (!form || form.status !== "active") {
      return res.status(404).json({ error: "Formulaire introuvable" });
    }
    const settings = sanitizeSettings(form.settings);
    const availability = isFormOpen(settings);
    if (!availability.ok) return res.status(403).json({ error: availability.error });

    return res.json({
      id: form.id,
      title: form.title,
      description: form.description,
      slug: form.slug,
      fields: form.fields || [],
      settings,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/public/:slug/submissions", async (req, res) => {
  try {
    const { slug } = req.params;
    const formRes = await pool.query(
      `SELECT id, fields, settings, status FROM forms WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    const form = formRes.rows[0];
    if (!form || form.status !== "active") {
      return res.status(404).json({ error: "Formulaire introuvable" });
    }

    const settings = sanitizeSettings(form.settings);

    // Vérification date d'ouverture/fermeture
    const availability = isFormOpen(settings);
    if (!availability.ok) return res.status(403).json({ error: availability.error });

    // Vérification limite de réponses
    if (settings.max_submissions > 0) {
      const countRes = await pool.query(
        "SELECT COUNT(*)::int AS total FROM form_submissions WHERE form_id = $1",
        [form.id]
      );
      if (countRes.rows[0].total >= settings.max_submissions) {
        return res.status(403).json({ error: "Ce formulaire a atteint le nombre maximum de reponses." });
      }
    }

    const values = sanitizeSubmissionValues(req.body?.values);
    const fields = Array.isArray(form.fields) ? form.fields : [];

    // Vérification une réponse par email
    if (settings.one_per_email) {
      const emailField = fields.find((f) => f?.type === "email");
      if (emailField && emailField.key) {
        const submittedEmail = String(values[emailField.key] || "").trim().toLowerCase();
        if (submittedEmail) {
          const dupRes = await pool.query(
            `SELECT 1 FROM form_submissions WHERE form_id = $1 AND lower(values->>'${emailField.key}') = $2 LIMIT 1`,
            [form.id, submittedEmail]
          );
          if (dupRes.rowCount > 0) {
            return res.status(409).json({ error: "Une reponse a deja ete enregistree avec cet email." });
          }
        }
      }
    }

    // Validation champs requis
    for (const field of fields) {
      if (field?.type === "separator") continue;
      if (!isFieldVisible(field, values)) continue;
      if (!field?.required) continue;
      const value = values[field.key];
      if (isMissingRequiredValue(field, value)) {
        return res.status(400).json({ error: `Le champ '${field.label}' est requis` });
      }
    }

    await pool.query(
      `INSERT INTO form_submissions (form_id, values, source, ip, user_agent) VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [form.id, JSON.stringify(values), "public", req.ip || null, req.headers["user-agent"] || null]
    );

    return res.status(201).json({
      success: true,
      redirect_url: settings.redirect_url || null,
      success_message: settings.success_message,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ADMIN ===== */
router.use(authMiddleware, requireAdmin);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.id, f.title, f.description, f.slug, f.status, f.created_at, f.updated_at,
             COUNT(s.id)::int AS submissions_count
      FROM forms f
      LEFT JOIN form_submissions s ON s.form_id = f.id
      GROUP BY f.id
      ORDER BY f.updated_at DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });

    const result = await pool.query(
      `SELECT id, title, description, slug, status, fields, settings, created_at, updated_at FROM forms WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Formulaire introuvable" });

    const stats = await pool.query(
      "SELECT COUNT(*)::int AS submissions_count FROM form_submissions WHERE form_id = $1",
      [id]
    );

    return res.json({
      ...result.rows[0],
      settings: sanitizeSettings(result.rows[0].settings),
      submissions_count: stats.rows[0]?.submissions_count || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/:id/submissions", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });

    const result = await pool.query(
      `SELECT id, submitted_at, values, source, ip, user_agent FROM form_submissions WHERE form_id = $1 ORDER BY submitted_at DESC LIMIT 500`,
      [id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id/submissions/:submissionId", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const submissionId = Number(req.params.submissionId);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(submissionId) || submissionId <= 0) {
      return res.status(400).json({ error: "ID invalide" });
    }
    const result = await pool.query(
      "DELETE FROM form_submissions WHERE id = $1 AND form_id = $2 RETURNING id",
      [submissionId, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Reponse introuvable" });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/:id/submissions/export.csv", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });

    const formRes = await pool.query("SELECT id, slug, fields FROM forms WHERE id = $1 LIMIT 1", [id]);
    if (formRes.rowCount === 0) return res.status(404).json({ error: "Formulaire introuvable" });

    const submissionsRes = await pool.query(
      `SELECT id, submitted_at, values, source, ip, user_agent FROM form_submissions WHERE form_id = $1 ORDER BY submitted_at DESC LIMIT 5000`,
      [id]
    );
    const rows = buildExportRows(Array.isArray(formRes.rows[0].fields) ? formRes.rows[0].fields : [], submissionsRes.rows);
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="form-${formRes.rows[0].slug}-submissions.csv"`);
    return res.send("﻿" + csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/:id/submissions/export.xlsx", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });

    const formRes = await pool.query("SELECT id, slug, fields FROM forms WHERE id = $1 LIMIT 1", [id]);
    if (formRes.rowCount === 0) return res.status(404).json({ error: "Formulaire introuvable" });

    const submissionsRes = await pool.query(
      `SELECT id, submitted_at, values, source, ip, user_agent FROM form_submissions WHERE form_id = $1 ORDER BY submitted_at DESC LIMIT 5000`,
      [id]
    );
    const rows = buildExportRows(Array.isArray(formRes.rows[0].fields) ? formRes.rows[0].fields : [], submissionsRes.rows);
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reponses");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="form-${formRes.rows[0].slug}-submissions.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim() || null;
    const status = sanitizeStatus(req.body?.status);
    const fields = sanitizeFields(req.body?.fields);
    const settings = sanitizeSettings(req.body?.settings);
    if (!title) return res.status(400).json({ error: "Titre requis" });
    if (fields.length === 0) return res.status(400).json({ error: "Ajoutez au moins un champ" });

    await client.query("BEGIN");
    const slug = await createUniqueSlug(client, title);
    const result = await client.query(
      `INSERT INTO forms (title, description, slug, status, fields, settings, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING id, title, description, slug, status, fields, settings, created_at, updated_at`,
      [title, description, slug, status, JSON.stringify(fields), JSON.stringify(settings), req.user.id]
    );
    await client.query("COMMIT");
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* Dupliquer un formulaire */
router.post("/:id/duplicate", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });

    const existing = await pool.query(
      "SELECT title, description, fields, settings FROM forms WHERE id = $1 LIMIT 1",
      [id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ error: "Formulaire introuvable" });

    const src = existing.rows[0];
    const newTitle = `${src.title} (copie)`;
    await client.query("BEGIN");
    const slug = await createUniqueSlug(client, newTitle);
    const result = await client.query(
      `INSERT INTO forms (title, description, slug, status, fields, settings, created_by)
       VALUES ($1, $2, $3, 'draft', $4::jsonb, $5::jsonb, $6)
       RETURNING id, title, slug, status, created_at, updated_at`,
      [newTitle, src.description, slug, JSON.stringify(src.fields || []), JSON.stringify(sanitizeSettings(src.settings)), req.user.id]
    );
    await client.query("COMMIT");
    return res.status(201).json({ ...result.rows[0], submissions_count: 0 });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* Basculer statut actif/brouillon */
router.patch("/:id/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });
    const status = sanitizeStatus(req.body?.status);
    const result = await pool.query(
      "UPDATE forms SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, status",
      [status, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Formulaire introuvable" });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });

    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim() || null;
    const status = sanitizeStatus(req.body?.status);
    const fields = sanitizeFields(req.body?.fields);
    const settings = sanitizeSettings(req.body?.settings);
    if (!title) return res.status(400).json({ error: "Titre requis" });
    if (fields.length === 0) return res.status(400).json({ error: "Ajoutez au moins un champ" });

    const existing = await client.query("SELECT id, slug, title FROM forms WHERE id = $1 LIMIT 1", [id]);
    if (existing.rowCount === 0) return res.status(404).json({ error: "Formulaire introuvable" });

    await client.query("BEGIN");
    let slug = existing.rows[0].slug;
    if (title !== existing.rows[0].title) slug = await createUniqueSlug(client, title, id);

    const result = await client.query(
      `UPDATE forms SET title=$1, description=$2, slug=$3, status=$4, fields=$5::jsonb, settings=$6::jsonb, updated_at=NOW()
       WHERE id=$7 RETURNING id, title, description, slug, status, fields, settings, created_at, updated_at`,
      [title, description, slug, status, JSON.stringify(fields), JSON.stringify(settings), id]
    );
    await client.query("COMMIT");
    return res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "ID invalide" });
    const result = await pool.query("DELETE FROM forms WHERE id = $1 RETURNING id", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Formulaire introuvable" });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
