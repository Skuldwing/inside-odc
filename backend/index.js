require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

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

const app = express();

/* ===== MIDDLEWARE GLOBAL ===== */
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : [];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS not allowed"));
    },
  })
);
app.use(express.json());

/* ===== HEALTH CHECK ===== */
app.get("/", (req, res) => {
  res.send("Inside ODC API OK");
});

/* ===== API ROUTES ===== */
app.use("/auth", authRoutes);
app.use("/activities", activitiesRoutes);
app.use("/partners", partnersRoutes);
app.use("/devices", devicesRoutes);
app.use("/users", usersRoutes);
app.use("/participants", participantsRoutes);
app.use("/campagnes", campagnesRoutes);
app.use("/import", importRoutes);
app.use("/dashboard", dashboardRoutes);

/* ===== ERROR HANDLER ===== */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur" });
});

/* ===== START SERVER ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
