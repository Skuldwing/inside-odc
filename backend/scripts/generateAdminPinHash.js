const bcrypt = require("bcrypt");

async function run() {
  const pin = process.argv[2];

  if (!pin) {
    console.error("Usage: node scripts/generateAdminPinHash.js <PIN>");
    process.exit(1);
  }

  const rounds = Number(process.env.ADMIN_PIN_BCRYPT_ROUNDS || 12);
  const hash = await bcrypt.hash(String(pin), rounds);
  console.log(hash);
}

run().catch((err) => {
  console.error("Failed to generate admin PIN hash:", err.message);
  process.exit(1);
});
