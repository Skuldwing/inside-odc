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
const aiRoutes = require("./routes/ai.routes");
const formsRoutes = require("./routes/forms.routes");
const checkinRoutes = require("./routes/checkin.routes");

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
app.use("/ai", aiRoutes);
app.use("/forms", formsRoutes);
app.use("/checkin", checkinRoutes);

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

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
