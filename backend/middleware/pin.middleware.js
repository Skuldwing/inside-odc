function requireAdminPin(req, res, next) {
  const configuredPin = process.env.ADMIN_PIN;
  if (!configuredPin) {
    return res
      .status(500)
      .json({ error: "PIN admin non configuré" });
  }

  const pin =
    req.headers["x-admin-pin"] ||
    req.headers["x-admin-pin".toLowerCase()];

  if (!pin || String(pin) !== String(configuredPin)) {
    return res.status(403).json({ error: "PIN invalide" });
  }

  next();
}

module.exports = requireAdminPin;
