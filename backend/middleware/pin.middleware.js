const crypto = require("crypto");
const bcrypt = require("bcrypt");

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function requireAdminPin(req, res, next) {
  const configuredPin = process.env.ADMIN_PIN;
  const configuredPinHash = process.env.ADMIN_PIN_HASH;

  if (!configuredPin && !configuredPinHash) {
    return res.status(500).json({ error: "PIN admin non configure" });
  }

  const pin = req.headers["x-admin-pin"];

  if (!pin) {
    return res.status(403).json({ error: "PIN invalide" });
  }

  let isValid = false;

  if (configuredPinHash) {
    isValid = await bcrypt.compare(String(pin), String(configuredPinHash));
  } else {
    isValid = safeEqual(pin, configuredPin);
  }

  if (!isValid) {
    return res.status(403).json({ error: "PIN invalide" });
  }

  next();
}

module.exports = requireAdminPin;
