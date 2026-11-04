const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const pool = require("../db");

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const PUZZLE_IMG = path.join(ASSETS_DIR, "reports", "report_puzzle.png");
const SURF_IMG = path.join(ASSETS_DIR, "reports", "report_surf.png");

const PAGE_W = 841.89;
const PAGE_H = 595.28;

function removeSonatel(value) {
  return String(value || "").replace(/sonatel/gi, "Orange Digital Center");
}

function plainText(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function reportPhotoBuffer(photo) {
  const mime = String(photo?.mime_type || "").toLowerCase();
  const name = String(photo?.filename || "").toLowerCase();
  const supported = mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg"
    || /\.(png|jpe?g)$/.test(name);
  if (!supported || !photo?.data) return null;
  return Buffer.isBuffer(photo.data) ? photo.data : Buffer.from(photo.data);
}

function drawReportImage(doc, source, x, y, width, height) {
  doc.roundedRect(x, y, width, height, 8).fillColor("#FFF8F3").strokeColor("#FED7AA").lineWidth(1).fillAndStroke();
  if (!source) return false;
  try {
    doc.image(source, x + 8, y + 8, {
      fit: [width - 16, height - 16],
      align: "center",
      valign: "center",
    });
    return true;
  } catch {
    return false;
  }
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/* Polyfills pour pdfjs-dist v6 qui s'appuie sur les toutes récentes méthodes
   Uint8Array.prototype.toHex / toBase64 (absentes de Node < 25).
   Doit être exécuté avant tout chargement de pdfjs. */
if (typeof Uint8Array.prototype.toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    value: function toHex() {
      return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("hex");
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
if (typeof Uint8Array.prototype.toBase64 !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toBase64", {
    value: function toBase64() {
      return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("base64");
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
if (typeof Uint8Array.fromHex !== "function") {
  Object.defineProperty(Uint8Array, "fromHex", {
    value: function fromHex(hex) {
      return new Uint8Array(Buffer.from(String(hex), "hex"));
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
if (typeof Uint8Array.fromBase64 !== "function") {
  Object.defineProperty(Uint8Array, "fromBase64", {
    value: function fromBase64(b64) {
      return new Uint8Array(Buffer.from(String(b64), "base64"));
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

const ORANGE = "#FF6600";
const ORANGE_LIGHT = "#FFF0E5";
const DARK = "#1A1A2E";
const GRAY = "#64748B";
const LIGHT_GRAY = "#F1F5F9";
const BORDER = "#E2E8F0";

const REPORT_TYPES = {
  rapport_synthese: "Rapport synthétique",
  liste_presence: "Liste de présence",
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR");
}

/* Récupère toutes les données nécessaires depuis la base. */
async function fetchActivityData(activityId) {
  const actRes = await pool.query(
    `SELECT a.id, a.title, a.description, a.activity_date, a.date_fin,
            a.duration_hours, a.location, a.mode, a.participants_manual,
            p.name AS partner_name, d.name AS device_name,
            u.full_name AS coach_name
       FROM activities a
       LEFT JOIN partners p ON a.partner_id = p.id
       LEFT JOIN devices d ON a.device_id = d.id
       LEFT JOIN users u ON a.coach_id = u.id
      WHERE a.id = $1`,
    [activityId]
  );
  if (!actRes.rows.length) return null;
  const activity = actRes.rows[0];

  const partRes = await pool.query(
    `SELECT p.id, p.nom, p.prenom, p.email, p.telephone, p.genre,
            p.age_range, p.structure, p.statut
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
      WHERE ap.activity_id = $1
      ORDER BY p.nom, p.prenom`,
    [activityId]
  );
  const participants = partRes.rows;

  const taskRes = await pool.query(
    `SELECT t.id, t.title, t.status, t.due_date,
            u.full_name AS assigned_name
       FROM activity_tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.activity_id = $1
      ORDER BY t.position, t.id`,
    [activityId]
  ).catch(() => ({ rows: [] }));

  const photoRes = await pool.query(
    `SELECT filename, mime_type, data
       FROM activity_photos
      WHERE activity_id = $1
      ORDER BY created_at ASC`,
    [activityId]
  ).catch(() => ({ rows: [] }));

  return { activity, participants, tasks: taskRes.rows, photos: photoRes.rows };
}

function computeStats(participants) {
  return {
    total: participants.length,
    femmes: participants.filter((p) => p.genre === "F").length,
    hommes: participants.filter((p) => p.genre === "H").length,
    autres: participants.filter((p) => p.genre !== "F" && p.genre !== "H").length,
    tranches_age: participants.reduce((acc, p) => {
      if (p.age_range) acc[p.age_range] = (acc[p.age_range] || 0) + 1;
      return acc;
    }, {}),
    structures: participants.reduce((acc, p) => {
      if (p.structure) acc[p.structure] = (acc[p.structure] || 0) + 1;
      return acc;
    }, {}),
  };
}

/* ── Document de base avec en-tête ODC ── */
function createBaseDoc() {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 70, bottom: 50, left: 50, right: 50 },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  doc.on("end", () => {});

  const W = doc.page.width;
  const L = doc.page.margins.left;
  const R = doc.page.margins.right;
  const cw = W - L - R;

  // Bande orange supérieure
  doc.rect(0, 0, W, 8).fill(ORANGE);

  // En-tête
  doc.fontSize(18).fillColor(ORANGE).font("Helvetica-Bold")
    .text("Orange Digital Center", L, 28);
  doc.fontSize(9).fillColor(GRAY).font("Helvetica")
    .text("Sénégal", L, 48);

  // Date de génération
  doc.fontSize(8).fillColor(GRAY)
    .text(`Généré le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`, R - 200, 30, { width: 200, align: "right" });

  // Ligne séparatrice
  doc.moveTo(L, 60).lineTo(W - R, 60).strokeColor(ORANGE).lineWidth(1).stroke();

  doc._chunks = chunks;
  doc._cw = cw;
  doc._L = L;
  doc._R = R;
  doc._W = W;

  return doc;
}

function finalize(doc) {
  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(doc._chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function sectionTitle(doc, text, y) {
  const L = doc._L;
  doc.rect(L, y, doc._cw, 0.1).strokeColor(BORDER);
  doc.fontSize(11).fillColor(DARK).font("Helvetica-Bold").text(text, L, y + 4);
  doc.moveTo(L, y + 22).lineTo(doc._W - doc._R, y + 22).strokeColor(ORANGE_LIGHT).lineWidth(1).stroke();
  return y + 30;
}

function infoRow(doc, label, value, y) {
  const L = doc._L;
  doc.fontSize(9).fillColor(GRAY).font("Helvetica").text(label, L, y, { width: 160 });
  doc.fillColor(DARK).font("Helvetica-Bold").text(value || "—", L + 165, y, { width: doc._cw - 165 });
  return y + 18;
}

/* ── Type 1 : Compte rendu complet ── */
function generateCompteRendu({ activity, participants, tasks, stats }) {
  const doc = createBaseDoc();
  const L = doc._L;
  let y = 80;

  doc.fontSize(16).fillColor(DARK).font("Helvetica-Bold")
    .text("Compte rendu d'activité", L, y);
  y += 28;

  doc.fontSize(13).fillColor(ORANGE).font("Helvetica-Bold")
    .text(activity.title, L, y, { width: doc._cw });
  y += 25;

  // Informations générales
  y = sectionTitle(doc, "Informations générales", y);
  y = infoRow(doc, "Date", formatDate(activity.activity_date), y);
  if (activity.date_fin)
    y = infoRow(doc, "Date de fin", formatDate(activity.date_fin), y);
  y = infoRow(doc, "Durée", activity.duration_hours ? `${activity.duration_hours} h` : "—", y);
  y = infoRow(doc, "Mode", activity.mode === "ligne" ? "En ligne" : "Présentiel", y);
  y = infoRow(doc, "Lieu", activity.location, y);
  y = infoRow(doc, "Dispositif", activity.device_name, y);
  y = infoRow(doc, "Partenaire", activity.partner_name, y);
  y = infoRow(doc, "Coach / Formateur", activity.coach_name, y);
  y += 6;

  // Description
  if (activity.description) {
    y = sectionTitle(doc, "Description", y);
    doc.fontSize(9).fillColor(DARK).font("Helvetica")
      .text(activity.description, L, y, { width: doc._cw, lineGap: 3 });
    y += Math.ceil(doc.heightOfString(activity.description, { width: doc._cw, lineGap: 3 })) + 16;
  }

  // Statistiques
  y = sectionTitle(doc, "Statistiques de participation", y);
  const pctF = stats.total ? Math.round((stats.femmes / stats.total) * 100) : 0;
  const pctH = stats.total ? Math.round((stats.hommes / stats.total) * 100) : 0;
  y = infoRow(doc, "Total participants", String(stats.total), y);
  y = infoRow(doc, "Femmes", `${stats.femmes} (${pctF}%)`, y);
  y = infoRow(doc, "Hommes", `${stats.hommes} (${pctH}%)`, y);
  if (stats.autres) y = infoRow(doc, "Autres", String(stats.autres), y);

  if (Object.keys(stats.tranches_age).length > 0) {
    y += 4;
    doc.fontSize(9).fillColor(GRAY).font("Helvetica").text("Tranches d'âge :", L, y);
    y += 16;
    Object.entries(stats.tranches_age).forEach(([k, v]) => {
      doc.fillColor(DARK).font("Helvetica-Bold").text(`  ${k}`, L, y, { width: 200 });
      doc.text(`${v} participant${v > 1 ? "s" : ""}`, L + 210, y);
      y += 14;
    });
  }
  y += 6;

  // Checklist
  if (tasks.length > 0) {
    if (y > 700) { doc.addPage(); y = 70; }
    y = sectionTitle(doc, "Checklist de préparation", y);
    tasks.forEach((t) => {
      const statusLabel = t.status === "termine" ? "✓ Terminé" : t.status === "en_cours" ? "→ En cours" : "○ À faire";
      const statusColor = t.status === "termine" ? "#10b981" : t.status === "en_cours" ? ORANGE : GRAY;
      doc.fontSize(9).fillColor(DARK).font("Helvetica").text(`• ${t.title}`, L, y, { width: doc._cw - 120 });
      doc.fillColor(statusColor).font("Helvetica-Bold").text(statusLabel, L + doc._cw - 110, y, { width: 110, align: "right" });
      y += 16;
    });
    y += 6;
  }

  // Liste des participants
  if (participants.length > 0) {
    if (y > 650) { doc.addPage(); y = 70; }
    y = sectionTitle(doc, `Liste des participants (${participants.length})`, y);

    // En-tête du tableau
    doc.rect(L, y, doc._cw, 18).fill(LIGHT_GRAY);
    doc.fontSize(8).fillColor(GRAY).font("Helvetica-Bold");
    doc.text("N°", L + 4, y + 5, { width: 25 });
    doc.text("Nom Prénom", L + 34, y + 5, { width: 150 });
    doc.text("Genre", L + 190, y + 5, { width: 40 });
    doc.text("Âge", L + 234, y + 5, { width: 70 });
    doc.text("Structure", L + 308, y + 5, { width: doc._cw - 312 });
    y += 18;

    participants.forEach((p, i) => {
      if (y > 780) { doc.addPage(); y = 70; }
      const fullName = `${p.nom || ""} ${p.prenom || ""}`.trim();
      doc.fontSize(8).fillColor(DARK).font("Helvetica");
      doc.text(String(i + 1), L + 4, y + 4, { width: 25 });
      doc.text(fullName, L + 34, y + 4, { width: 150 });
      doc.text(p.genre || "—", L + 190, y + 4, { width: 40 });
      doc.text(p.age_range || "—", L + 234, y + 4, { width: 70 });
      doc.text(p.structure || "—", L + 308, y + 4, { width: doc._cw - 312 });
      doc.moveTo(L, y + 16).lineTo(doc._W - doc._R, y + 16).strokeColor(BORDER).lineWidth(0.3).stroke();
      y += 16;
    });
  }

  return finalize(doc);
}

/* ── Type 2 : Bilan de participation ── */
function generateBilanParticipation({ activity, participants, stats }) {
  const doc = createBaseDoc();
  const L = doc._L;
  const cw = doc._cw;
  let y = 80;

  doc.fontSize(16).fillColor(DARK).font("Helvetica-Bold").text("Bilan de participation", L, y);
  y += 28;
  doc.fontSize(13).fillColor(ORANGE).font("Helvetica-Bold").text(activity.title, L, y, { width: cw });
  y += 20;
  doc.fontSize(9).fillColor(GRAY).font("Helvetica").text(`${formatDate(activity.activity_date)} — ${activity.location || "—"}`, L, y);
  y += 25;

  // Cartes statistiques
  y = sectionTitle(doc, "Chiffres clés", y);
  const cards = [
    { label: "Total", value: stats.total, color: ORANGE },
    { label: "Femmes", value: stats.femmes, color: "#EC4899" },
    { label: "Hommes", value: stats.hommes, color: "#3B82F6" },
  ];
  const cardW = (cw - 20) / 3;
  cards.forEach((c, i) => {
    const cx = L + i * (cardW + 10);
    doc.roundedRect(cx, y, cardW, 50, 6).fillColor(ORANGE_LIGHT).fill();
    doc.fontSize(20).fillColor(c.color).font("Helvetica-Bold").text(String(c.value), cx + 10, y + 8);
    doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(c.label, cx + 10, y + 32);
  });
  y += 65;

  // Répartition par genre (barre)
  if (stats.total > 0) {
    y = sectionTitle(doc, "Répartition par genre", y);
    const barW = cw;
    const fW = (stats.femmes / stats.total) * barW;
    const hW = (stats.hommes / stats.total) * barW;
    const aW = (stats.autres / stats.total) * barW;
    doc.rect(L, y, fW, 16).fill("#EC4899").fill();
    doc.rect(L + fW, y, hW, 16).fill("#3B82F6").fill();
    if (aW > 0) doc.rect(L + fW + hW, y, aW, 16).fill(GRAY).fill();
    doc.fontSize(8).fillColor(DARK).font("Helvetica-Bold")
      .text(`F ${stats.femmes} (${Math.round((stats.femmes / stats.total) * 100)}%)`, L, y + 20);
    doc.text(`H ${stats.hommes} (${Math.round((stats.hommes / stats.total) * 100)}%)`, L + 150, y + 20);
    y += 40;
  }

  // Tranches d'âge
  if (Object.keys(stats.tranches_age).length > 0) {
    y = sectionTitle(doc, "Répartition par tranche d'âge", y);
    const maxAge = Math.max(...Object.values(stats.tranches_age));
    Object.entries(stats.tranches_age).forEach(([k, v]) => {
      doc.fontSize(9).fillColor(DARK).font("Helvetica").text(k, L, y, { width: 120 });
      const barW = (v / maxAge) * (cw - 180);
      doc.rect(L + 125, y + 2, barW, 10).fill(ORANGE).fill();
      doc.fillColor(DARK).font("Helvetica-Bold").text(String(v), L + 125 + barW + 6, y, { width: 40 });
      y += 18;
    });
    y += 6;
  }

  // Structures
  if (Object.keys(stats.structures).length > 0) {
    if (y > 650) { doc.addPage(); y = 70; }
    y = sectionTitle(doc, "Répartition par structure", y);
    const sorted = Object.entries(stats.structures).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([k, v]) => {
      doc.fontSize(9).fillColor(DARK).font("Helvetica").text(k, L, y, { width: 200 });
      doc.fillColor(GRAY).font("Helvetica-Bold").text(`${v} participant${v > 1 ? "s" : ""}`, L + 210, y);
      y += 16;
    });
  }

  return finalize(doc);
}

function formatPeriodeLongue(dateDebutStr, dateFinStr, durationHours) {
  if (!dateDebutStr) return "Dates à préciser";
  const d1 = new Date(dateDebutStr);
  const m1 = MOIS_FR[d1.getMonth()] || "";
  const j1 = d1.getDate();
  const a1 = d1.getFullYear();

  let heuresSuffix = " de 09H à 13H";
  if (durationHours && durationHours > 4 && durationHours <= 8) {
    heuresSuffix = " de 09H à 17H";
  }

  if (!dateFinStr || dateDebutStr === dateFinStr) {
    const j1Str = j1 === 1 ? "1er" : `${j1}`;
    return `Le ${j1Str} ${m1} ${a1}${heuresSuffix}`;
  }

  const d2 = new Date(dateFinStr);
  const m2 = MOIS_FR[d2.getMonth()] || "";
  const j2 = d2.getDate();
  const a2 = d2.getFullYear();

  const j1Str = j1 === 1 ? "1er" : `${j1}`;
  const j2Str = j2 === 1 ? "1er" : `${j2}`;

  if (a1 === a2 && m1 === m2) {
    return `Du ${j1Str} au ${j2Str} ${m1} ${a1}${heuresSuffix}`;
  } else if (a1 === a2) {
    return `Du ${j1Str} ${m1} au ${j2Str} ${m2} ${a1}${heuresSuffix}`;
  }
  return `Du ${j1Str} ${m1} ${a1} au ${j2Str} ${m2} ${a2}${heuresSuffix}`;
}

function buildQueRetenirParagraphs(activity) {
  const title = plainText(activity.title || "l'activité");
  const desc = plainText(activity.description);
  const titleLower = title.toLowerCase();

  if (desc) {
    return [
      `La formation « ${title} » porte sur le thème indiqué par son intitulé.`,
      desc,
    ];
  }

  if (
    titleLower.includes("cms") ||
    titleLower.includes("site") ||
    titleLower.includes("wordpress") ||
    titleLower.includes("web")
  ) {
    return [
      `La formation « ${title} » porte sur la création et la gestion d'un site web à l'aide d'un système de gestion de contenu (CMS).`,
      "Elle présente les principes de fonctionnement d'un CMS, son tableau de bord et les étapes de préparation d'un site.",
      "Les notions abordées comprennent la création de pages, l'organisation des contenus, la personnalisation d'un thème et l'ajout d'extensions.",
      "La formation introduit également le responsive design, le référencement naturel (SEO), la sécurité et la maintenance d'un site web.",
    ];
  }

  if (/financ|budget|comptab|gestion.*digital|digital.*gestion/.test(titleLower)) {
    return [
      `La formation « ${title} » porte sur les usages numériques appliqués à la gestion financière.`,
      "Elle peut aider à comprendre comment les outils numériques facilitent le suivi des opérations, l'organisation des données financières et la préparation des décisions.",
      "Les thèmes à présenter peuvent inclure le suivi budgétaire, la gestion des recettes et dépenses, ainsi que les bonnes pratiques de fiabilité et de sécurité des données.",
      "Le contenu détaillé de cette session n'étant pas renseigné, les outils et exercices effectivement abordés restent à préciser dans la description de l'activité.",
    ];
  }

  return [
    `La formation « ${title} » est consacrée au thème annoncé dans le titre de l'activité.`,
    "Elle vise à expliquer les notions principales, présenter les outils liés à ce thème et montrer des exemples d'utilisation.",
    "Des exercices pratiques peuvent permettre aux participants de mettre en application les notions abordées pendant la session.",
    "La description de l'activité peut être complétée pour préciser le programme, les outils utilisés et les réalisations de la formation.",
  ];
}

function drawSlideHeader(doc, pageNumber, categoryLabel, totalPages = 3) {
  doc.rect(0, 0, PAGE_W, 8).fill(ORANGE);
  doc.fontSize(14).fillColor(ORANGE).font("Helvetica-Bold").text("Orange Digital Center", 40, 17);
  doc.fontSize(7.5).fillColor(GRAY).font("Helvetica-Bold").text("SÉNÉGAL", 40, 34);

  doc.roundedRect(280, 20, 280, 22, 11).fillColor(ORANGE_LIGHT).fill();
  doc.fontSize(8.5).fillColor(ORANGE).font("Helvetica-Bold").text(categoryLabel, 280, 26, { width: 280, align: "center" });

  doc.roundedRect(PAGE_W - 95, 20, 55, 22, 6).fillColor("#F1F5F9").fill();
  doc.fontSize(9).fillColor(DARK).font("Helvetica-Bold").text(`${pageNumber} / ${totalPages}`, PAGE_W - 95, 25, { width: 55, align: "center" });

  doc.moveTo(40, 52).lineTo(PAGE_W - 40, 52).strokeColor(BORDER).lineWidth(1).stroke();
}

function drawSlideFooter(doc, pageNumber, note) {
  doc.moveTo(40, 563).lineTo(PAGE_W - 40, 563).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(note || "Orange Digital Center Sénégal • Rapport synthétique officiel", 40, 571);
  doc.fontSize(8).fillColor(GRAY).font("Helvetica-Bold").text(`Page ${pageNumber}`, PAGE_W - 100, 571, { width: 60, align: "right" });
}

/* ── Type : Rapport synthétique (Format Officiel Orange Digital Center) ── */
function generateRapportSynthese({ activity, participants, tasks, stats, photos = [] }) {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: {
      Title: `Rapport synthétique - ${removeSonatel(activity.title || "Activité ODC")}`,
      Author: "Orange Digital Center Sénégal",
    },
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));

  const pctF = stats.total ? Math.round((stats.femmes / stats.total) * 100) : 0;
  const pctH = stats.total ? Math.round((stats.hommes / stats.total) * 100) : 0;
  const periodeStr = formatPeriodeLongue(activity.activity_date, activity.date_fin, activity.duration_hours);
  const safeActivity = {
    ...activity,
    title: removeSonatel(activity.title),
    description: removeSonatel(plainText(activity.description)),
    location: removeSonatel(activity.location),
    device_name: removeSonatel(activity.device_name),
    partner_name: removeSonatel(activity.partner_name),
  };
  const deviceName = (safeActivity.device_name || "ACTIVITÉ ODC").toUpperCase();
  const activityPhotos = photos.map(reportPhotoBuffer).filter(Boolean);
  const coverImage = activityPhotos[0] || (!activityPhotos.length && fs.existsSync(SURF_IMG) ? SURF_IMG : null);
  const pageThreeFallbackImage = !activityPhotos.length && fs.existsSync(PUZZLE_IMG) ? PUZZLE_IMG : null;

  // ==========================================
  // SLIDE 1 : COUVERTURE OFFICIELLE
  // ==========================================
  doc.rect(0, 0, PAGE_W, 10).fill(ORANGE);

  doc.fontSize(24).fillColor(ORANGE).font("Helvetica-Bold").text("Orange Digital Center", 50, 40);
  doc.fontSize(9.5).fillColor(GRAY).font("Helvetica-Bold").text("SÉNÉGAL", 50, 68);

  // Badge Dispositif
  const badgeTitle = `RAPPORT DE ${deviceName}`;
  doc.roundedRect(50, 115, 260, 24, 12).fillColor(ORANGE).fill();
  doc.fontSize(9.5).fillColor("#FFFFFF").font("Helvetica-Bold").text(badgeTitle, 50, 122, { width: 260, align: "center" });

  // Grand Titre de l'Activité
  const activityTitleMain = (safeActivity.title || "ACTIVITÉ NUMÉRIQUE").toUpperCase();
  doc.fontSize(24).fillColor(DARK).font("Helvetica-Bold").text(activityTitleMain, 50, 155, { width: 420, lineGap: 4 });
  const titleHeight = doc.heightOfString(activityTitleMain, { width: 420, lineGap: 4 });
  const lineY = 155 + titleHeight + 10;
  doc.moveTo(50, lineY).lineTo(200, lineY).strokeColor(ORANGE).lineWidth(3).stroke();

  // Cartouche Métadonnées
  const metaY = Math.min(Math.max(lineY + 18, 205), 280);
  doc.roundedRect(50, metaY, 420, 250, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.fontSize(10.5).fillColor(ORANGE).font("Helvetica-Bold").text("INFORMATIONS GÉNÉRALES", 68, metaY + 14);
  doc.moveTo(68, metaY + 30).lineTo(450, metaY + 30).strokeColor("#FED7AA").lineWidth(1).stroke();

  const metaRows = [
    ["Période & Horaires", periodeStr],
    ["Lieu", safeActivity.location || "ODC (Orange Digital Center)"],
    ["Participants", `${stats.total || activity.participants_manual || "Effectif non renseigné"}${stats.total || activity.participants_manual ? " participants" : ""}`],
    ["Programme", safeActivity.device_name || "Non renseigné"],
    ["Partenaire", safeActivity.partner_name || "Orange Digital Center Sénégal"],
    ["Modalité", activity.mode === "ligne" ? "Formation en ligne (distanciel)" : activity.mode ? "Présentiel" : "Non renseignée"]
  ];

  let rY = metaY + 40;
  metaRows.forEach(([lbl, val]) => {
    doc.fontSize(8.5).fillColor(GRAY).font("Helvetica").text(lbl, 68, rY, { width: 125 });
    doc.fillColor(DARK).font("Helvetica-Bold").text(val, 198, rY, { width: 255 });
    rY += 24;
  });

  // Photo de l'activité; à défaut, illustration Orange Digital Center fournie.
  drawReportImage(doc, coverImage, 495, 115, 300, 300);
  doc.fontSize(11).fillColor(DARK).font("Helvetica-Bold").text("Orange Digital Center", 510, 430, { width: 270, align: "center" });
  doc.fontSize(8.5).fillColor(GRAY).font("Helvetica").text("Sénégal", 515, 450, { width: 260, align: "center" });

  doc.fontSize(8).fillColor(GRAY).font("Helvetica").text("Orange Digital Center Sénégal • Document officiel de synthèse", 50, 568);
  doc.text("Page 1", PAGE_W - 100, 568, { width: 50, align: "right" });

  // ==========================================
  // SLIDE 2 : CONTEXTE & CHIFFRES CLÉS
  // ==========================================
  doc.addPage({ size: "A4", layout: "landscape", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  drawSlideHeader(doc, 2, "CONTEXTE & CHIFFRES CLÉS");

  doc.fontSize(16).fillColor(DARK).font("Helvetica-Bold").text("Contexte Pédagogique & Indicateurs de Participation", 40, 68);
  doc.fontSize(9).fillColor(GRAY).font("Helvetica").text("Synthèse des effectifs formés, indicateurs de parité et dynamique d'apprentissage.", 40, 88);

  // 4 Cartes KPIs
  const kpiY = 108;
  const kpiW = 175;
  const kpiH = 58;
  const kpis = [
    { num: String(stats.total || activity.participants_manual || "—"), lbl: "Participants", col: ORANGE, sub: stats.total ? "Inscrits à cette activité" : "Effectif à renseigner" },
    { num: `${pctF}%`, lbl: "Participation féminine", col: "#EC4899", sub: `${stats.femmes} femmes inscrites` },
    { num: `${pctH}%`, lbl: "Participation masculine", col: "#3B82F6", sub: `${stats.hommes} hommes inscrits` },
    { num: activity.duration_hours ? `${activity.duration_hours}h` : "—", lbl: "Volume horaire", col: "#10B981", sub: "Durée renseignée" }
  ];

  kpis.forEach((k, idx) => {
    const kx = 40 + idx * (kpiW + 20);
    doc.roundedRect(kx, kpiY, kpiW, kpiH, 6).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
    doc.fontSize(17).fillColor(k.col).font("Helvetica-Bold").text(k.num, kx + 12, kpiY + 8);
    doc.fontSize(8.5).fillColor(DARK).font("Helvetica-Bold").text(k.lbl, kx + 12, kpiY + 28);
    doc.fontSize(7.5).fillColor(GRAY).font("Helvetica").text(k.sub, kx + 12, kpiY + 41);
  });

  // Colonne Gauche : Contexte & Illustration Puzzle
  const colLeftX = 40;
  const colLeftW = 370;

  doc.roundedRect(colLeftX, 180, colLeftW, 140, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.fontSize(11).fillColor(ORANGE).font("Helvetica-Bold").text("Objectifs & Contexte du Programme", colLeftX + 16, 194);
  doc.moveTo(colLeftX + 16, 210).lineTo(colLeftX + colLeftW - 16, 210).strokeColor(BORDER).lineWidth(1).stroke();

  const ctxText = (safeActivity.description || `Cette activité « ${safeActivity.title || "formation numérique"} » s'inscrit dans les actions de formation d'Orange Digital Center. Elle vise à développer des compétences pratiques et à faciliter la prise en main des outils numériques.`).trim();
  doc.fontSize(8.5).fillColor(DARK).font("Helvetica").text(ctxText, colLeftX + 16, 218, { width: colLeftW - 32, height: 66, ellipsis: true, lineGap: 3 });
  doc.fontSize(8.5).fillColor(GRAY).font("Helvetica-Bold").text("• Orange Digital Center Sénégal", colLeftX + 16, 292, { width: colLeftW - 32 });

  doc.roundedRect(colLeftX, 332, colLeftW, 218, 8).fillColor(ORANGE_LIGHT).strokeColor("#FED7AA").lineWidth(1).fillAndStroke();
  doc.fontSize(12).fillColor(ORANGE).font("Helvetica-Bold").text("Orange Digital Center", colLeftX + 20, 398, { width: colLeftW - 40, align: "center" });
  doc.fontSize(9).fillColor(GRAY).font("Helvetica-Bold").text("SÉNÉGAL", colLeftX + 20, 419, { width: colLeftW - 40, align: "center" });
  doc.fontSize(8.5).fillColor(GRAY).font("Helvetica").text("Formation, innovation et inclusion numérique.", colLeftX + 20, 441, { width: colLeftW - 40, align: "center" });

  // Colonne Droite : Démographie & Profils
  const colRightX = 430;
  const colRightW = 372;

  // Carte Parité
  doc.roundedRect(colRightX, 180, colRightW, 90, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.fontSize(10.5).fillColor(DARK).font("Helvetica-Bold").text("Répartition par Genre", colRightX + 16, 194);
  const barW = colRightW - 32;
  const fW = stats.total ? Math.round((stats.femmes / stats.total) * barW) : Math.round(barW / 2);
  const hW = barW - fW;
  doc.rect(colRightX + 16, 216, fW, 14).fill("#EC4899");
  doc.rect(colRightX + 16 + fW, 216, hW, 14).fill("#3B82F6");
  doc.fontSize(8.5).fillColor(DARK).font("Helvetica-Bold").text(`Femmes : ${stats.femmes} (${pctF}%)`, colRightX + 16, 238);
  doc.text(`Hommes : ${stats.hommes} (${pctH}%)`, colRightX + colRightW - 140, 238, { width: 124, align: "right" });

  // Carte Tranches d'âge
  doc.roundedRect(colRightX, 282, colRightW, 130, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.fontSize(10.5).fillColor(DARK).font("Helvetica-Bold").text("Répartition par Tranche d'Âge", colRightX + 16, 296);

  const ages = Object.entries(stats.tranches_age || {});
  let ageY = 320;
  const maxVal = Math.max(...ages.map(a => a[1])) || 1;
  ages.slice(0, 3).forEach(([tranche, nb]) => {
    doc.fontSize(8.5).fillColor(DARK).font("Helvetica").text(tranche, colRightX + 16, ageY, { width: 85 });
    const bW = Math.max(10, Math.round((nb / maxVal) * (colRightW - 165)));
    doc.rect(colRightX + 105, ageY + 1, bW, 10).fill(ORANGE);
    doc.fontSize(8.5).fillColor(DARK).font("Helvetica-Bold").text(`${nb} (${Math.round((nb / (stats.total || 20)) * 100)}%)`, colRightX + 115 + bW, ageY);
    ageY += 24;
  });
  if (ages.length === 0) doc.fontSize(8.5).fillColor(GRAY).font("Helvetica").text("Âges non renseignés.", colRightX + 16, 324, { width: colRightW - 32 });

  // Carte Établissements & Structures
  doc.roundedRect(colRightX, 424, colRightW, 126, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.fontSize(10.5).fillColor(DARK).font("Helvetica-Bold").text("Origine des Apprenants & Structures", colRightX + 16, 438);

  const structs = Object.entries(stats.structures || {}).map(([name, count]) => [removeSonatel(name), count]);
  let stY = 462;
  structs.slice(0, 3).forEach(([sName, sVal]) => {
    doc.fontSize(8.5).fillColor(DARK).font("Helvetica").text(`• ${sName}`, colRightX + 16, stY, { width: 250 });
    doc.fillColor(ORANGE).font("Helvetica-Bold").text(typeof sVal === "number" ? `${sVal} pers.` : sVal, colRightX + colRightW - 90, stY, { width: 74, align: "right" });
    stY += 20;
  });
  if (structs.length === 0) doc.fontSize(8.5).fillColor(GRAY).font("Helvetica").text("Structures d'origine non renseignées.", colRightX + 16, 462, { width: colRightW - 32 });

  drawSlideFooter(doc, 2);

  // ==========================================
  // SLIDE 3 : FICHE OFFICIELLE D'ACTIVITÉ
  // ==========================================
  doc.addPage({ size: "A4", layout: "landscape", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  drawSlideHeader(doc, 3, "FICHE OFFICIELLE D'ACTIVITÉ");

  doc.fontSize(16).fillColor(DARK).font("Helvetica-Bold").text("Fiche Synthétique de l'Activité (Format Officiel ODC)", 40, 68);
  doc.fontSize(9).fillColor(GRAY).font("Helvetica").text("Cadrage opérationnel et synthèse des acquis de formation.", 40, 88);

  // Colonne Gauche : 4 Cartes Quoi / Quand / Où / Qui
  const qx = 40;
  const qw = 275;

  // 1. Quoi ?
  doc.roundedRect(qx, 108, qw, 80, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.roundedRect(qx + 12, 118, 65, 18, 4).fillColor(ORANGE).fill();
  doc.fontSize(8.5).fillColor("#FFFFFF").font("Helvetica-Bold").text("QUOI ?", qx + 12, 123, { width: 65, align: "center" });
  doc.fontSize(10.5).fillColor(DARK).font("Helvetica-Bold").text(safeActivity.title || "Activité numérique", qx + 12, 144, { width: qw - 24 });
  doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(safeActivity.device_name || "Orange Digital Center", qx + 12, 168);

  // 2. Quand ?
  doc.roundedRect(qx, 198, qw, 80, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.roundedRect(qx + 12, 208, 155, 18, 4).fillColor(ORANGE).fill();
  doc.fontSize(8.5).fillColor("#FFFFFF").font("Helvetica-Bold").text("QUAND ? (DATE ET HEURES)", qx + 12, 213, { width: 155, align: "center" });
  doc.fontSize(9.5).fillColor(DARK).font("Helvetica-Bold").text(periodeStr, qx + 12, 234, { width: qw - 24, lineGap: 2 });
  doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(activity.duration_hours ? `Durée globale : ${activity.duration_hours} heures` : "Durée : non renseignée", qx + 12, 258);

  // 3. Où ?
  doc.roundedRect(qx, 288, qw, 76, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.roundedRect(qx + 12, 298, 50, 18, 4).fillColor(ORANGE).fill();
  doc.fontSize(8.5).fillColor("#FFFFFF").font("Helvetica-Bold").text("OÙ ?", qx + 12, 303, { width: 50, align: "center" });
  doc.fontSize(10.5).fillColor(DARK).font("Helvetica-Bold").text(safeActivity.location || "Orange Digital Center", qx + 12, 324, { width: qw - 24 });
  doc.fontSize(8).fillColor(GRAY).font("Helvetica").text(activity.mode === "ligne" ? "Formation en distanciel" : activity.mode ? "Formation en présentiel" : "Modalité non renseignée", qx + 12, 344);

  // Les photos restantes occupent l'espace de l'ancienne rubrique « Qui ? ».
  const remainingPhotos = activityPhotos.length ? activityPhotos.slice(1, 8) : (pageThreeFallbackImage ? [pageThreeFallbackImage] : []);
  doc.roundedRect(qx, 374, qw, 176, 8).fillColor(LIGHT_GRAY).strokeColor(BORDER).lineWidth(1).fillAndStroke();
  doc.fontSize(10).fillColor(ORANGE).font("Helvetica-Bold").text(remainingPhotos.length ? "PHOTOS DE L'ACTIVITÉ" : "DÉTAILS DE L'ACTIVITÉ", qx + 12, 388);
  if (remainingPhotos.length) {
    const cols = Math.min(3, remainingPhotos.length);
    const rows = Math.ceil(remainingPhotos.length / cols);
    const gap = 6;
    const cellW = (qw - 24 - gap * (cols - 1)) / cols;
    const cellH = (138 - gap * (rows - 1)) / rows;
    remainingPhotos.forEach((photo, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      drawReportImage(doc, photo, qx + 12 + col * (cellW + gap), 408 + row * (cellH + gap), cellW, cellH);
    });
  } else {
    const detailText = safeActivity.description || "Orange Digital Center Sénégal accompagne les participants dans la découverte et la pratique des compétences numériques liées à cette activité.";
    doc.fontSize(8.5).fillColor(DARK).font("Helvetica").text(detailText, qx + 12, 408, { width: qw - 24, height: 126, ellipsis: true, lineGap: 3 });
  }

  // Colonne Droite : LA CARTE "QUE RETENIR ?"
  const qrX = 330;
  const qrW = 472;
  const qrH = 442;

  doc.roundedRect(qrX, 108, qrW, qrH, 10).fillColor("#FFFDFB").strokeColor("#FED7AA").lineWidth(1.5).fillAndStroke();

  // En-tête orange de la carte Que retenir
  doc.roundedRect(qrX, 108, qrW, 36, 10).fillColor(ORANGE).fill();
  doc.rect(qrX, 134, qrW, 10).fill(ORANGE);
  doc.fontSize(13).fillColor("#FFFFFF").font("Helvetica-Bold").text("QUE RETENIR ?", qrX + 18, 120);
  doc.fontSize(8).fillColor("#FFF0E5").font("Helvetica-Bold").text("COMPÉTENCES & APPRENTISSAGES CLÉS", qrX + qrW - 220, 122, { width: 202, align: "right" });

  const paragraphs = buildQueRetenirParagraphs(safeActivity);
  let pY = 160;

  for (const [i, pText] of paragraphs.entries()) {
    const availableHeight = 542 - pY;
    if (availableHeight <= 10) break;
    // Pastille numérotée
    doc.circle(qrX + 26, pY + 7, 10).fillColor(ORANGE_LIGHT).strokeColor(ORANGE).lineWidth(1).fillAndStroke();
    doc.fontSize(8.5).fillColor(ORANGE).font("Helvetica-Bold").text(String(i + 1), qrX + 16, pY + 2.5, { width: 20, align: "center" });

    // Texte du paragraphe
    const pHeight = doc.heightOfString(pText, { width: qrW - 64, lineGap: 3, fontSize: 9 });
    doc.fontSize(9).fillColor(DARK).font("Helvetica").text(pText, qrX + 46, pY, {
      width: qrW - 64,
      height: Math.min(pHeight, availableHeight),
      ellipsis: pHeight > availableHeight,
      lineGap: 3,
    });
    if (pHeight > availableHeight) break;
    pY += Math.max(pHeight + 14, 46);
  }

  drawSlideFooter(doc, 3);

  // Le rapport se termine ici : aucune page « Bilan & clôture » ni bloc de
  // signatures n'est ajouté au PDF synthétique.
  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });


}

/* ── Type : Liste de présence ──
   Tableau avec nom, prénom, genre, âge, téléphone, email, structure et
   colonne signature. L'orientation paysage donnerait plus de place mais on
   reste en portrait pour rester cohérent avec les autres rapports. */
function generateListePresence({ activity, participants, referenceText }) {
  const doc = createBaseDoc();
  const L = doc._L;
  const cw = doc._cw;
  let y = 80;

  doc.fontSize(16).fillColor(DARK).font("Helvetica-Bold").text("Liste de présence", L, y);
  y += 28;
  doc.fontSize(13).fillColor(ORANGE).font("Helvetica-Bold").text(activity.title, L, y, { width: cw });
  y += 18;
  doc.fontSize(9).fillColor(GRAY).font("Helvetica").text(`${formatDate(activity.activity_date)} — ${activity.location || "—"}`, L, y);
  y += 20;
  doc.fontSize(9).fillColor(DARK).font("Helvetica-Bold").text(`${participants.length} participant${participants.length > 1 ? "s" : ""}`, L, y);
  y += 20;

  // En-tête tableau — colonnes ajustées pour inclure tel et email
  const cols = [
    { label: "N°", x: L, w: 20 },
    { label: "Nom", x: L + 24, w: 75 },
    { label: "Prénom", x: L + 104, w: 80 },
    { label: "Genre", x: L + 189, w: 28 },
    { label: "Âge", x: L + 222, w: 50 },
    { label: "Téléphone", x: L + 277, w: 70 },
    { label: "Email", x: L + 352, w: 100 },
    { label: "Structure", x: L + 457, w: cw - 510 },
    { label: "Signature", x: L + cw - 48, w: 48 },
  ];

  const drawHeader = () => {
    doc.rect(L, y, cw, 20).fill(LIGHT_GRAY);
    doc.fontSize(7).fillColor(GRAY).font("Helvetica-Bold");
    cols.forEach((c) => doc.text(c.label, c.x, y + 6, { width: c.w }));
    y += 20;
  };
  drawHeader();

  participants.forEach((p, i) => {
    if (y > 780) {
      doc.addPage();
      y = 70;
      drawHeader();
    }
    doc.fontSize(7).fillColor(DARK).font("Helvetica");
    doc.text(String(i + 1), cols[0].x, y + 5, { width: cols[0].w });
    doc.text(p.nom || "—", cols[1].x, y + 5, { width: cols[1].w });
    doc.text(p.prenom || "—", cols[2].x, y + 5, { width: cols[2].w });
    doc.text(p.genre || "—", cols[3].x, y + 5, { width: cols[3].w });
    doc.text(p.age_range || "—", cols[4].x, y + 5, { width: cols[4].w });
    doc.text(p.telephone || "—", cols[5].x, y + 5, { width: cols[5].w });
    doc.text(p.email || "—", cols[6].x, y + 5, { width: cols[6].w });
    doc.text(p.structure || "—", cols[7].x, y + 5, { width: cols[7].w });
    // Ligne de signature
    doc.moveTo(cols[8].x, y + 12).lineTo(cols[8].x + 38, y + 12).strokeColor(GRAY).lineWidth(0.5).stroke();
    doc.moveTo(L, y + 18).lineTo(doc._W - doc._R, y + 18).strokeColor(BORDER).lineWidth(0.3).stroke();
    y += 18;
  });

  return finalize(doc);
}

/* ── Clonage depuis un rapport de référence ──
   L'utilisateur fournit un PDF de référence. Au lieu de régénérer un
   PDF de zéro, on MODIFIE DIRECTEMENT le PDF de référence :
   1. Extraire le texte et ses positions avec pdfjs-dist
   2. Charger le PDF avec pdf-lib
   3. Pour chaque ligne contenant des données (dates, nombres, contacts),
      recouvrir l'ancien texte d'un rectangle blanc et écrire le nouveau
      à la même position
   4. Sauvegarder le PDF modifié
   Le résultat est visuellement identique au référence, seules les
   données sont remplacées. */

/* Remplace tous les motifs de données dans le texte de référence par les
   données réelles de l'activité. */
function replaceDataInText(text, activity, stats, participants) {
  let r = text;

  /* 1. Dates au format long français ("15 mars 2024") */
  const dateLong = formatDate(activity.activity_date);
  r = r.replace(
    /\b\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/gi,
    dateLong
  );

  /* 2. Dates au format court ("15/03/2024", "15-03-24") */
  const dateCourt = formatDateShort(activity.activity_date);
  r = r.replace(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g, dateCourt);

  /* 3. Nombre de participants */
  const nbPart = stats.total;
  r = r.replace(/\b\d+\s*participant(?:e)?s?\b/gi, `${nbPart} participant${nbPart > 1 ? "s" : ""}`);

  /* 4. Parité — nombres absolus */
  r = r.replace(/\b\d+\s*femme(?:s)?\b/gi, `${stats.femmes} femme${stats.femmes > 1 ? "s" : ""}`);
  r = r.replace(/\b\d+\s*homme(?:s)?\b/gi, `${stats.hommes} homme${stats.hommes > 1 ? "s" : ""}`);

  /* 5. Parité — pourcentages */
  const pctF = stats.total ? Math.round((stats.femmes / stats.total) * 100) : 0;
  const pctH = stats.total ? Math.round((stats.hommes / stats.total) * 100) : 0;
  r = r.replace(/\b\d+\s*%\s*(?:de\s+)?(?:femme|féminin)/gi, `${pctF}% féminin`);
  r = r.replace(/\b\d+\s*%\s*(?:de\s+)?(?:homme|masculin)/gi, `${pctH}% masculin`);

  /* 6. Durée ("8 heures", "8h", "8.5 h") */
  if (activity.duration_hours) {
    r = r.replace(/\b\d+(?:[.,]\d+)?\s*(?:h|heure(?:s)?)\b/gi, `${activity.duration_hours} h`);
  }

  /* 7. Numéros de téléphone sénégalais — remplacés par ceux des participants */
  const phones = participants.filter((p) => p.telephone).map((p) => p.telephone);
  if (phones.length > 0) {
    let idx = 0;
    r = r.replace(
      /\b(?:\+221\s?)?(?:77|78|76|70)\s?\d{3}\s?\d{2}\s?\d{2}\b/g,
      () => phones[idx++ % phones.length] || "—"
    );
  }

  /* 8. Emails — remplacés par ceux des participants */
  const emails = participants.filter((p) => p.email).map((p) => p.email);
  if (emails.length > 0) {
    let idx = 0;
    r = r.replace(
      /\b[\w.-]+@[\w.-]+\.\w{2,}\b/g,
      () => emails[idx++ % emails.length] || "—"
    );
  }

  /* 9. Lieu — remplacer les noms de villes communs par le lieu de l'activité */
  if (activity.location) {
    r = r.replace(/\bDakar\b/g, activity.location);
    r = r.replace(/\bSaint-Louis\b/g, activity.location);
    r = r.replace(/\bThiès\b/g, activity.location);
  }

  /* 10. Titre de l'activité — remplacer par le titre réel. */
  if (activity.title) {
    r = r.replace(/\b(?:Rapport|Compte rendu|Bilan|Synthèse)\s+(?:d[e']activité|d[e']animation)?\s*[:\-]?\s*.+/gi, (m) => {
      return m.replace(/[:\-]\s*.+/, `: ${activity.title}`);
    });
  }

  return r;
}

/* Modifie directement le PDF de référence en remplaçant les données.
   Utilise pdfjs-dist pour extraire le texte avec ses positions, puis
   pdf-lib pour recouvrir et réécrire les données aux mêmes positions. */
async function generateFromReference({ activity, participants, stats, referenceBuffer }) {
  const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
  let pdfjs;
  try {
    /* Build legacy : recommandé pour Node.js. */
    pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    pdfjs = require("pdfjs-dist");
  }

  /* 1. Extraire le texte avec les positions via pdfjs. */
  let loadingTask;
  try {
    loadingTask = pdfjs.getDocument({
      data: new Uint8Array(referenceBuffer),
      disableFontFace: true,
      useSystemFonts: true,
    });
  } catch (e) {
    throw new Error("Impossible de lire le PDF de référence: " + e.message);
  }

  const pdfRef = await loadingTask.promise;

  /* 2. Charger le même PDF avec pdf-lib pour modification. */
  const pdfLibDoc = await PDFDocument.load(referenceBuffer);
  const pages = pdfLibDoc.getPages();
  const helvetica = await pdfLibDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfLibDoc.embedFont(StandardFonts.HelveticaBold);
  const white = rgb(1, 1, 1);
  const black = rgb(0, 0, 0);

  /* Index cycliques pour les remplacements de contacts. */
  const phones = participants.filter((p) => p.telephone).map((p) => p.telephone);
  const emails = participants.filter((p) => p.email).map((p) => p.email);

  /* 3. Parcourir chaque page et remplacer les données. */
  for (let pageNum = 1; pageNum <= pdfRef.numPages; pageNum++) {
    const page = await pdfRef.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;
    const pdfLibPage = pages[pageNum - 1];

    /* Grouper les items texte par ligne (position y similaire). */
    const lineMap = new Map();
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      /* pdfjs transform: [scaleX, 0, 0, scaleY, x, y] */
      const transform = item.transform;
      const x = transform[4];
      const y = transform[5];
      const fontSize = Math.sqrt(transform[0] * transform[0] + transform[2] * transform[2]);
      /* Arrondir y au multiple de 2 le plus proche pour grouper par ligne. */
      const lineKey = Math.round(y / 2) * 2;

      if (!lineMap.has(lineKey)) {
        lineMap.set(lineKey, {
          y: y,
          items: [],
          fontSize: fontSize,
        });
      }
      const lineData = lineMap.get(lineKey);
      lineData.items.push({
        text: item.str,
        x: x,
        y: y,
        fontSize: fontSize,
        width: item.width || 0,
      });
      /* Garder la plus grande taille de police de la ligne. */
      if (fontSize > lineData.fontSize) lineData.fontSize = fontSize;
    }

    /* 4. Pour chaque ligne, joindre le texte, vérifier s'il contient des
       données à remplacer, et si oui, recouvrir et réécrire. */
    for (const [lineKey, lineData] of lineMap) {
      /* Trier les items par position x (gauche → droite). */
      lineData.items.sort((a, b) => a.x - b.x);

      /* Reconstruire le texte de la ligne. */
      const originalText = lineData.items.map((i) => i.text).join(" ").replace(/\s+/g, " ").trim();

      /* Remplacer les données. */
      const newText = replaceDataInText(originalText, activity, stats, participants);

      /* Si rien n'a changé, passer à la ligne suivante. */
      if (newText === originalText) continue;

      /* Calculer la zone à recouvrir (tous les items de la ligne). */
      const minX = Math.min(...lineData.items.map((i) => i.x));
      const maxX = Math.max(...lineData.items.map((i) => i.x + i.width));
      const fs = lineData.fontSize || 9;
      const rectH = fs + 3;

      /* Recouvrir l'ancien texte avec un rectangle blanc. */
      pdfLibPage.drawRectangle({
        x: minX - 1,
        y: lineData.y - 2,
        width: Math.max(maxX - minX + 2, 50),
        height: rectH,
        color: white,
      });

      /* Écrire le nouveau texte à la même position. */
      try {
        /* Détecter si la ligne est en gras (titre/label) pour utiliser
           la bonne fonte. */
        const isBold = originalText === originalText.toUpperCase() && originalText.length < 60;
        const font = isBold ? helveticaBold : helvetica;

        /* Tronquer si le nouveau texte est plus long que l'espace
           disponible pour éviter de déborder. */
        const maxWidth = maxX - minX + 20;
        let displayText = newText;
        const textWidth = font.widthOfTextAtSize(displayText, fs);
        if (textWidth > maxWidth) {
          /* Tronquer progressivement. */
          while (displayText.length > 3 && font.widthOfTextAtSize(displayText + "…", fs) > maxWidth) {
            displayText = displayText.slice(0, -1);
          }
          displayText += "…";
        }

        pdfLibPage.drawText(displayText, {
          x: minX,
          y: lineData.y,
          size: fs,
          font: font,
          color: black,
        });
      } catch {
        /* Si l'écriture échoue (caractères non supportés), passer. */
      }
    }
  }

  /* 5. Sauvegarder le PDF modifié. */
  const modifiedBuffer = await pdfLibDoc.save();
  return Buffer.from(modifiedBuffer);
}

/* ── Point d'entrée ──
   Si referenceBuffer est fourni (PDF de référence), on modifie
   directement ce PDF en remplaçant les données. Sinon, on génère selon
   le type demandé. */
async function generateActivityReport(activityId, reportType, referenceBuffer = null) {
  const data = await fetchActivityData(activityId);
  if (!data) throw new Error("Activité introuvable");

  const stats = computeStats(data.participants);
  const payload = { ...data, stats };

  let buffer;
  /* Le rapport synthétique possède son propre modèle ODC détaillé. Un PDF
     joint ne doit jamais réimposer son ancienne mise en page (souvent une
     seule page) à ce rapport. Le clonage reste disponible pour les autres
     types de rapport qui demandent explicitement un modèle. */
  const applyReference = Boolean(referenceBuffer && reportType !== "rapport_synthese");
  if (applyReference) {
    /* Mode clonage : on modifie directement le PDF de référence. */
    buffer = await generateFromReference({ ...payload, referenceBuffer });
  } else {
    switch (reportType) {
      case "rapport_synthese":
        buffer = await generateRapportSynthese(payload);
        break;
      case "liste_presence":
        buffer = await generateListePresence(payload);
        break;
      default:
        throw new Error("Type de rapport inconnu");
    }
  }

  const suffix = applyReference ? "reference" : reportType;
  const filename = reportType === "rapport_synthese" && !applyReference
    ? `rapport_synthese_detaille_v2_${activityId}.pdf`
    : `rapport_${suffix}_${activityId}.pdf`;
  return { buffer, filename, referenceApplied: applyReference };
}

module.exports = { generateActivityReport, REPORT_TYPES };
