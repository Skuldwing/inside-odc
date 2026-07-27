const PDFDocument = require("pdfkit");

const ORANGE = "#FF6600";
const DARK = "#1A1A2E";
const GRAY = "#64748B";
const LIGHT_GRAY = "#F1F5F9";

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function generateAttestationPDF({ participant, activity, partner, device }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const L = doc.page.margins.left;
    const contentWidth = W - doc.page.margins.left - doc.page.margins.right;

    // ── Bande supérieure orange ─────────────────────────────────────────────
    doc.rect(0, 0, W, 12).fill(ORANGE);

    // ── En-tête ODC ─────────────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(ORANGE)
      .text("Orange Digital Center", L, 30, { align: "center" });

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(GRAY)
      .text("Sénégal", L, 55, { align: "center" });

    // ── Ligne séparatrice ───────────────────────────────────────────────────
    doc
      .moveTo(L, 75)
      .lineTo(W - L, 75)
      .strokeColor(ORANGE)
      .lineWidth(1.5)
      .stroke();

    // ── Titre principal ─────────────────────────────────────────────────────
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor(DARK)
      .text("ATTESTATION DE PARTICIPATION", L, 95, { align: "center" });

    // ── Sous-titre ──────────────────────────────────────────────────────────
    const nomFormation = device || "Formation";
    doc
      .font("Helvetica")
      .fontSize(13)
      .fillColor(GRAY)
      .text(nomFormation, L, 128, { align: "center" });

    doc.moveDown(2.5);

    // ── Corps du texte ──────────────────────────────────────────────────────
    const fullName =
      [participant.prenom, participant.nom].filter(Boolean).join(" ") ||
      "Participant";

    doc
      .font("Helvetica")
      .fontSize(13)
      .fillColor(DARK)
      .text("Nous soussignés, l'Orange Digital Center Sénégal, certifions que :", {
        align: "center",
      });

    doc.moveDown(1.5);

    // Encadré nom
    const nameBoxY = doc.y;
    doc.rect(L, nameBoxY, contentWidth, 48).fill(LIGHT_GRAY);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(ORANGE)
      .text(fullName, L, nameBoxY + 12, { align: "center", width: contentWidth });

    doc.moveDown(2.5);

    doc
      .font("Helvetica")
      .fontSize(13)
      .fillColor(DARK)
      .text("a bien participé à l'activité :", { align: "center" });

    doc.moveDown(0.8);

    // Titre activité
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(DARK)
      .text(`« ${activity.title} »`, { align: "center" });

    doc.moveDown(1.5);

    // ── Grille d'informations ───────────────────────────────────────────────
    const infoY = doc.y;
    const col1X = L;
    const col2X = L + contentWidth / 2 + 10;
    const halfW = contentWidth / 2 - 10;

    function infoBox(x, y, label, value, width) {
      doc.rect(x, y, width, 52).fill(LIGHT_GRAY);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(GRAY)
        .text(label.toUpperCase(), x + 10, y + 8, { width: width - 20 });
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor(DARK)
        .text(value || "—", x + 10, y + 24, { width: width - 20 });
    }

    const dateText = activity.date_fin
      ? `Du ${formatDate(activity.activity_date)} au ${formatDate(activity.date_fin)}`
      : formatDate(activity.activity_date);

    infoBox(col1X, infoY, "Date", dateText, halfW);
    infoBox(col2X, infoY, "Lieu", activity.location || "ODC Sénégal", halfW);

    doc.y = infoY + 60;
    const infoY2 = doc.y;

    infoBox(col1X, infoY2, "Partenaire", partner || "ODC Sénégal", halfW);
    infoBox(
      col2X,
      infoY2,
      "Durée",
      activity.duration_hours ? `${activity.duration_hours}h` : "—",
      halfW
    );

    doc.moveDown(3.5);

    // ── Ligne de signature ──────────────────────────────────────────────────
    const sigY = doc.y;

    doc
      .moveTo(L + 10, sigY + 40)
      .lineTo(L + 160, sigY + 40)
      .strokeColor(DARK)
      .lineWidth(0.5)
      .stroke();

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(GRAY)
      .text("Le Responsable ODC", L + 10, sigY + 46);

    // Date d'émission à droite
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(GRAY)
      .text(
        `Émis le ${new Date().toLocaleDateString("fr-FR")}`,
        W - L - 160,
        sigY + 46,
        { width: 160, align: "right" }
      );

    // ── Bande inférieure ────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.rect(0, pageH - 12, W, 12).fill(ORANGE);

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(GRAY)
      .text(
        "Orange Digital Center Sénégal · orangedigitalcenter@orange-sonatel.com",
        L,
        pageH - 30,
        { align: "center" }
      );

    doc.end();
  });
}

module.exports = { generateAttestationPDF };
