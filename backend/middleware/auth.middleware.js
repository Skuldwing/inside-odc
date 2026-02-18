const jwt = require("jsonwebtoken");

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
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token invalide" });
  }
}

module.exports = authMiddleware;
