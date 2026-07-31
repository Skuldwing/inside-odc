const jwt = require("jsonwebtoken");
const pool = require("../db");

const SESSION_DURATION_MS  = 8 * 60 * 60 * 1000; // 8h
const SESSION_DURATION_STR = "8h";

function makeCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: process.env.JWT_COOKIE_SAMESITE || (isProd ? "none" : "lax"),
    path: "/",
    maxAge: SESSION_DURATION_MS,
  };
}

function extractCookieToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const tokenCookie = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("token="));

  if (!tokenCookie) return null;
  return decodeURIComponent(tokenCookie.slice("token=".length));
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const bearerToken =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;
  const cookieToken = extractCookieToken(req);
  const token = bearerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ error: "Token manquant" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, partner_id }

    // Session glissante : renouvelle le cookie à chaque requête authentifiée
    if (cookieToken) {
      const freshToken = jwt.sign(
        { id: decoded.id, role: decoded.role, partner_id: decoded.partner_id },
        process.env.JWT_SECRET,
        { expiresIn: SESSION_DURATION_STR }
      );
      res.cookie("token", freshToken, makeCookieOptions());
    }

    pool.query("UPDATE users SET last_seen_at = NOW() WHERE id = $1", [decoded.id]).catch(() => {});
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide" });
  }
}

module.exports = authMiddleware;
