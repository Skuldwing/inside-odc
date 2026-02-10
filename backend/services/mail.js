const BREVO_API_KEY = process.env.BREVO_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Inside ODC";
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false") === "true";

async function sendEmail({ toEmail, toName, subject, html, text }) {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS && MAIL_FROM) {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
      to: toName ? `"${toName}" <${toEmail}>` : toEmail,
      subject,
      html,
      text,
    });
    return;
  }

  if (!BREVO_API_KEY || !MAIL_FROM) {
    console.warn("Email not configured. Skipping email send.");
    return;
  }

  const payload = {
    sender: { email: MAIL_FROM, name: MAIL_FROM_NAME },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject,
    htmlContent: html,
    textContent: text,
  };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo error ${res.status}: ${body}`);
  }
}

module.exports = { sendEmail };
