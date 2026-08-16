require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pool = require("./db");

/* ===== ROUTES ===== */
const authRoutes = require("./routes/auth.routes");
const activitiesRoutes = require("./routes/activities.routes");
const partnersRoutes = require("./routes/partners.routes");
const devicesRoutes = require("./routes/devices.routes");
const usersRoutes = require("./routes/users.routes");
const participantsRoutes = require("./routes/participants.routes");
const campagnesRoutes = require("./routes/campagnes.routes");
const importRoutes = require("./routes/import.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const socialKpisRoutes = require("./routes/socialKpis.routes");
const socialDashboardRoutes = require("./routes/socialDashboard.routes");
const socialReportRoutes = require("./routes/socialReport.routes");
const aiRoutes = require("./routes/ai.routes");
const formsRoutes = require("./routes/forms.routes");
const checkinRoutes = require("./routes/checkin.routes");
const voteRoutes = require("./routes/vote.routes");
const { router: emailTemplatesRoutes } = require("./routes/emailTemplates.routes");
const auditRoutes = require("./routes/audit.routes");

const requiredEnv = ["DATABASE_URL", "JWT_SECRET"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

const app = express();

/* ===== MIDDLEWARE GLOBAL ===== */
app.set("trust proxy", 1);
app.use(helmet());

const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Reessayez plus tard." },
});

app.use(globalRateLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - start;
    console.log(
      JSON.stringify({
        level: "info",
        type: "http",
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: durationMs,
      })
    );
  });
  next();
});

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

if (process.env.NODE_ENV === "production" && allowedOrigins.length === 0) {
  console.warn(
    "Warning: CORS_ORIGIN not set — toutes les origines sont autorisees temporairement."
  );
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS_NOT_ALLOWED"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));

/* ===== HEALTH CHECK ===== */
app.get("/", (req, res) => {
  res.send("Inside ODC API OK");
});

app.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "up" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", db: "down" });
  }
});

/* ===== API ROUTES ===== */
app.use("/auth", authRateLimiter, authRoutes);
app.use("/activities", activitiesRoutes);
app.use("/partners", partnersRoutes);
app.use("/devices", devicesRoutes);
app.use("/users", usersRoutes);
app.use("/participants", participantsRoutes);
app.use("/campagnes", campagnesRoutes);
app.use("/import", importRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/social-kpis", socialKpisRoutes);
app.use("/social-dashboard", socialDashboardRoutes);
app.use("/social-dashboard", socialReportRoutes);
app.use("/ai", aiRoutes);
app.use("/forms", formsRoutes);
app.use("/checkin", checkinRoutes);
app.use("/vote", voteRoutes);
app.use("/email-templates", emailTemplatesRoutes);
app.use("/audit-logs", auditRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Route introuvable" });
});

/* ===== ERROR HANDLER ===== */
app.use((err, req, res, next) => {
  if (err && err.message === "CORS_NOT_ALLOWED") {
    return res.status(403).json({ error: "Origine non autorisee" });
  }

  console.error(err);
  res.status(500).json({ error: "Erreur serveur" });
});

/* ===== MIGRATIONS AU DEMARRAGE ===== */
pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS participants_manual INTEGER`)
  .then(() => console.log("Migration OK: participants_manual"))
  .catch((err) => console.warn("Migration participants_manual:", err.message));

pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS date_fin DATE`)
  .then(() => console.log("Migration OK: date_fin"))
  .catch((err) => console.warn("Migration date_fin:", err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS vote_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    event_date DATE,
    status VARCHAR(20) DEFAULT 'draft',
    active_project_id UUID,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: vote_sessions")).catch(e => console.warn("Migration vote_sessions:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS vote_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES vote_sessions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    porteur VARCHAR(255),
    description TEXT,
    order_num INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: vote_projects")).catch(e => console.warn("Migration vote_projects:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS vote_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES vote_sessions(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    scale INTEGER DEFAULT 10,
    weight NUMERIC(4,2) DEFAULT 1,
    order_num INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: vote_criteria")).catch(e => console.warn("Migration vote_criteria:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS vote_jury (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES vote_sessions(id) ON DELETE CASCADE,
    pseudo VARCHAR(100) NOT NULL,
    avatar VARCHAR(20) DEFAULT '🧑',
    token UUID UNIQUE DEFAULT gen_random_uuid(),
    joined_at TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: vote_jury")).catch(e => console.warn("Migration vote_jury:", e.message));

/* Contrainte unicité pseudo par session (migration idempotente) */
pool.query(`
  DO $$
  BEGIN
    -- Supprimer les doublons en gardant la ligne la plus récente (joined_at DESC)
    DELETE FROM vote_jury
    WHERE id NOT IN (
      SELECT DISTINCT ON (session_id, pseudo) id
      FROM vote_jury
      ORDER BY session_id, pseudo, joined_at DESC NULLS LAST
    );
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'vote_jury_session_pseudo_unique'
    ) THEN
      ALTER TABLE vote_jury ADD CONSTRAINT vote_jury_session_pseudo_unique UNIQUE (session_id, pseudo);
    END IF;
  END;
  $$
`).then(() => console.log("Migration OK: vote_jury_unique")).catch(e => console.warn("Migration vote_jury_unique:", e.message));

/* Colonne avatar en TEXT pour supporter les URLs DiceBear */
pool.query(`
  DO $$
  BEGIN
    ALTER TABLE vote_jury ALTER COLUMN avatar TYPE TEXT;
  EXCEPTION WHEN others THEN NULL;
  END;
  $$
`).then(() => console.log("Migration OK: vote_jury_avatar_text")).catch(e => console.warn("Migration vote_jury_avatar_text:", e.message));

/* Colonne email pour récupération de session */
pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='vote_jury' AND column_name='email'
    ) THEN
      ALTER TABLE vote_jury ADD COLUMN email VARCHAR(255);
    END IF;
  END;
  $$
`).then(() => console.log("Migration OK: vote_jury_email")).catch(e => console.warn("Migration vote_jury_email:", e.message));

/* Index unique partiel : un email par session (NULL exclus) */
pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS vote_jury_session_email_idx
  ON vote_jury (session_id, email)
  WHERE email IS NOT NULL
`).then(() => console.log("Migration OK: vote_jury_email_idx")).catch(e => console.warn("Migration vote_jury_email_idx:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS vote_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES vote_sessions(id) ON DELETE CASCADE,
    project_id UUID REFERENCES vote_projects(id) ON DELETE CASCADE,
    jury_id UUID REFERENCES vote_jury(id) ON DELETE CASCADE,
    criteria_id UUID REFERENCES vote_criteria(id) ON DELETE CASCADE,
    score NUMERIC(4,1) NOT NULL,
    comment TEXT,
    submitted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, jury_id, criteria_id)
  )
`).then(() => console.log("Migration OK: vote_scores")).catch(e => console.warn("Migration vote_scores:", e.message));

/* Colonnes timer (ajout safe sur tables existantes) */
pool.query(`ALTER TABLE vote_sessions ADD COLUMN IF NOT EXISTS pitch_duration_minutes INT DEFAULT 5`)
  .then(() => console.log("Migration OK: vote_sessions.pitch_duration_minutes")).catch(e => console.warn("Migration pitch_duration_minutes:", e.message));
pool.query(`ALTER TABLE vote_sessions ADD COLUMN IF NOT EXISTS qa_duration_minutes INT DEFAULT 5`)
  .then(() => console.log("Migration OK: vote_sessions.qa_duration_minutes")).catch(e => console.warn("Migration qa_duration_minutes:", e.message));
pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`)
  .then(() => console.log("Migration OK: vote_projects.started_at")).catch(e => console.warn("Migration started_at:", e.message));
pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS qa_started_at TIMESTAMPTZ`)
  .then(() => console.log("Migration OK: vote_projects.qa_started_at")).catch(e => console.warn("Migration qa_started_at:", e.message));
pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS pitch_stopped_at TIMESTAMPTZ`)
  .then(() => console.log("Migration OK: vote_projects.pitch_stopped_at")).catch(e => console.warn("Migration pitch_stopped_at:", e.message));
pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS qa_stopped_at TIMESTAMPTZ`)
  .then(() => console.log("Migration OK: vote_projects.qa_stopped_at")).catch(e => console.warn("Migration qa_stopped_at:", e.message));
pool.query(`ALTER TABLE vote_criteria ADD COLUMN IF NOT EXISTS description TEXT`)
  .then(() => console.log("Migration OK: vote_criteria.description")).catch(e => console.warn("Migration criteria.description:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS partner_devices (
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    device_id  INTEGER NOT NULL REFERENCES devices(id)  ON DELETE CASCADE,
    PRIMARY KEY (partner_id, device_id)
  )
`).then(() => console.log("Migration OK: partner_devices")).catch(e => console.warn("Migration partner_devices:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS email_templates (
    slug        TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    description TEXT,
    subject     TEXT NOT NULL,
    body_html   TEXT NOT NULL,
    variables   JSONB NOT NULL DEFAULT '[]',
    updated_at  TIMESTAMP DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: email_templates")).catch(e => console.warn("Migration email_templates:", e.message));

/* Rôle coach */
pool.query(`
  DO $$
  BEGIN
    BEGIN
      ALTER TABLE users DROP CONSTRAINT users_role_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('admin','partner','viewer','coach'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END$$;
`).then(() => console.log("Migration OK: users role=coach")).catch(e => console.warn("Migration users role:", e.message));

pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS coach_id INTEGER REFERENCES users(id)`)
  .then(() => console.log("Migration OK: activities.coach_id")).catch(e => console.warn("Migration coach_id:", e.message));

pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS report_filename TEXT`)
  .then(() => console.log("Migration OK: activities.report_filename")).catch(e => console.warn("Migration report_filename:", e.message));

pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS report_data BYTEA`)
  .then(() => console.log("Migration OK: activities.report_data")).catch(e => console.warn("Migration report_data:", e.message));

pool.query(`ALTER TABLE activities ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'presentiel'`)
  .then(() => console.log("Migration OK: activities.mode")).catch(e => console.warn("Migration mode:", e.message));

pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS objective_beneficiaries INTEGER DEFAULT NULL`)
  .then(() => console.log("Migration OK: users.objective_beneficiaries"))
  .catch(e => console.warn("Migration users.objective_beneficiaries:", e.message));

pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`)
  .then(() => console.log("Migration OK: users.last_seen_at"))
  .catch(e => console.warn("Migration users.last_seen_at:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id             BIGSERIAL PRIMARY KEY,
    user_id        INTEGER,
    user_full_name TEXT,
    user_role      TEXT,
    action         TEXT NOT NULL,
    resource       TEXT NOT NULL,
    resource_id    TEXT,
    resource_label TEXT,
    details        JSONB DEFAULT '{}',
    ip_address     TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: audit_logs")).catch(e => console.warn("Migration audit_logs:", e.message));

/* Migration : colonnes campagnes emailing */
pool.query(`
  ALTER TABLE campagnes
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS html_body TEXT,
  ADD COLUMN IF NOT EXISTS recipients_type TEXT DEFAULT 'all_participants',
  ADD COLUMN IF NOT EXISTS activity_id INTEGER,
  ADD COLUMN IF NOT EXISTS custom_emails TEXT DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS send_mode TEXT DEFAULT 'publipostage',
  ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ
`).then(() => console.log("Migration OK: campagnes emailing columns")).catch(e => console.warn("Migration campagnes columns:", e.message));

/* Migration : ajouter youtube dans la contrainte CHECK de social_media_kpis */
pool.query(`
  DO $$
  BEGIN
    BEGIN
      ALTER TABLE social_media_kpis DROP CONSTRAINT social_media_kpis_platform_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    BEGIN
      ALTER TABLE social_media_kpis ADD CONSTRAINT social_media_kpis_platform_check
        CHECK (platform IN ('facebook','instagram','linkedin','x','tiktok','youtube'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END$$;
`).then(() => console.log("Migration OK: social_media_kpis youtube")).catch(e => console.warn("Migration social youtube:", e.message));

/* Migration : mémoire Pobarr */
pool.query(`
  CREATE TABLE IF NOT EXISTS ai_insights (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content    TEXT NOT NULL,
    category   VARCHAR(50) DEFAULT 'observation',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: ai_insights")).catch(e => console.warn("Migration ai_insights:", e.message));

pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_last_seen_at TIMESTAMPTZ`)
  .then(() => console.log("Migration OK: users.notifications_last_seen_at"))
  .catch(e => console.warn("Migration notifications_last_seen_at:", e.message));

/* ── Vote : présentation projets + espace invités ── */
pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS presentation_url TEXT`)
  .then(() => console.log("Migration OK: vote_projects.presentation_url"))
  .catch(e => console.warn("Migration presentation_url:", e.message));

pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS presentation_pdf TEXT`)
  .then(() => console.log("Migration OK: vote_projects.presentation_pdf"))
  .catch(e => console.warn("Migration presentation_pdf:", e.message));

pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS video_url TEXT`)
  .then(() => console.log("Migration OK: vote_projects.video_url"))
  .catch(e => console.warn("Migration video_url:", e.message));

pool.query(`ALTER TABLE vote_projects ADD COLUMN IF NOT EXISTS video_file TEXT`)
  .then(() => console.log("Migration OK: vote_projects.video_file"))
  .catch(e => console.warn("Migration video_file:", e.message));

pool.query(`ALTER TABLE vote_sessions ADD COLUMN IF NOT EXISTS projector_video_active BOOLEAN DEFAULT FALSE`)
  .then(() => console.log("Migration OK: vote_sessions.projector_video_active"))
  .catch(e => console.warn("Migration projector_video_active:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS vote_guests (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES vote_sessions(id) ON DELETE CASCADE,
    prenom     VARCHAR(100) NOT NULL,
    nom        VARCHAR(100) NOT NULL,
    avatar     TEXT DEFAULT '🎓',
    email      VARCHAR(255),
    token      UUID UNIQUE DEFAULT gen_random_uuid(),
    joined_at  TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => console.log("Migration OK: vote_guests")).catch(e => console.warn("Migration vote_guests:", e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS vote_guest_predictions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guest_id           UUID REFERENCES vote_guests(id) ON DELETE CASCADE,
    session_id         UUID REFERENCES vote_sessions(id) ON DELETE CASCADE,
    predicted_ranking  JSONB NOT NULL,
    submitted_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(guest_id, session_id)
  )
`).then(() => console.log("Migration OK: vote_guest_predictions")).catch(e => console.warn("Migration vote_guest_predictions:", e.message));

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
