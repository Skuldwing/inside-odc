const express = require("express");
const PDFDocument = require("pdfkit");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");

const router = express.Router();
router.use(authMiddleware, requireAdmin);

/* ===== CONSTANTES ===== */
const ORANGE     = "#F97316";
const DARK       = "#0F172A";
const DARK2      = "#1E293B";
const GRAY       = "#64748B";
const LIGHT      = "#F8FAFC";
const LIGHT2     = "#F1F5F9";
const WHITE      = "#FFFFFF";

const PLATFORMS = [
  { value: "facebook",  label: "Facebook",  color: "#1877F2" },
  { value: "instagram", label: "Instagram", color: "#E1306C" },
  { value: "linkedin",  label: "LinkedIn",  color: "#0A66C2" },
  { value: "x",         label: "X",         color: "#111827" },
  { value: "tiktok",    label: "TikTok",    color: "#14B8A6" },
  { value: "youtube",   label: "YouTube",   color: "#FF0000" },
];

const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet",
                   "Août","Septembre","Octobre","Novembre","Décembre"];

/* ===== HELPERS ===== */
function formatCompact(n) {
  n = Number(n || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)} K`;
  return n.toLocaleString("fr-FR");
}

function formatDateFR(str) {
  if (!str) return "";
  const [y, m, d] = String(str).split("-");
  return `${d}/${m}/${y}`;
}

function parseDateRange(type, params) {
  const year  = Number(params.year)  || new Date().getFullYear();
  const month = Number(params.month) || 1;

  if (type === "month") {
    const mm  = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    return {
      from:  `${year}-${mm}-01`,
      to:    `${year}-${mm}-${lastDay}`,
      label: `${MONTHS_FR[month - 1]} ${year}`,
      type:  "month",
    };
  }
  if (type === "period") {
    const from = params.date_from;
    const to   = params.date_to;
    if (!from || !to) return null;
    return {
      from, to,
      label: `Du ${formatDateFR(from)} au ${formatDateFR(to)}`,
      type:  "period",
    };
  }
  // annual (default)
  return {
    from:  `${year}-01-01`,
    to:    `${year}-12-31`,
    label: `Année ${year}`,
    type:  "annual",
  };
}

/* ===== ROUTE ===== */
router.get("/report", async (req, res) => {
  try {
    const { type = "annual" } = req.query;
    const range = parseDateRange(type, req.query);
    if (!range) return res.status(400).json({ error: "Paramètres de période invalides" });

    const [platRes, monthlyRes] = await Promise.all([
      pool.query(`
        SELECT platform,
          COALESCE(SUM(followers), 0)::bigint    AS followers,
          COALESCE(SUM(reach), 0)::bigint        AS reach,
          COALESCE(SUM(engagement), 0)::bigint   AS engagement,
          COALESCE(SUM(unique_users), 0)::bigint AS unique_users,
          COALESCE(SUM(results), 0)::bigint      AS results
        FROM social_media_kpis
        WHERE month_date >= $1 AND month_date <= $2
        GROUP BY platform
      `, [range.from, range.to]),
      pool.query(`
        SELECT
          to_char(month_date, 'YYYY-MM') AS month,
          SUM(followers)::bigint    AS followers,
          SUM(reach)::bigint        AS reach,
          SUM(engagement)::bigint   AS engagement,
          SUM(unique_users)::bigint AS unique_users,
          SUM(results)::bigint      AS results
        FROM social_media_kpis
        WHERE month_date >= $1 AND month_date <= $2
        GROUP BY month ORDER BY month
      `, [range.from, range.to]),
    ]);

    const byPlatformMap = new Map(platRes.rows.map(r => [r.platform, r]));
    const platformData = PLATFORMS.map(p => ({
      ...p,
      ...(byPlatformMap.get(p.value) || { followers: 0, reach: 0, engagement: 0, unique_users: 0, results: 0 }),
    }));
    const totals = platformData.reduce((acc, p) => ({
      followers:    acc.followers    + Number(p.followers    || 0),
      reach:        acc.reach        + Number(p.reach        || 0),
      engagement:   acc.engagement   + Number(p.engagement   || 0),
      unique_users: acc.unique_users + Number(p.unique_users || 0),
      results:      acc.results      + Number(p.results      || 0),
    }), { followers: 0, reach: 0, engagement: 0, unique_users: 0, results: 0 });

    const pdf = await buildPDF({ range, platformData, totals, monthly: monthlyRes.rows });

    const slug = range.label.toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="radar-social-${slug}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur génération rapport" });
  }
});

/* ===== GÉNÉRATION PDF ===== */
function buildPDF({ range, platformData, totals, monthly }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 }, autoFirstPage: true });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W  = doc.page.width;   // 595.28
    const H  = doc.page.height;  // 841.89
    const L  = 50;
    const CW = W - 100;          // 495.28

    /* helpers */
    const hr = (y, color = ORANGE, lw = 1) =>
      doc.moveTo(L, y).lineTo(L + CW, y).strokeColor(color).lineWidth(lw).stroke();

    const sectionLabel = (text, y) => {
      doc.rect(L, y, CW, 18).fill(LIGHT2);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY)
         .text(text, L + 8, y + 5, { width: CW - 16, lineBreak: false });
      return y + 18;
    };

    /* table helpers */
    const tblHeader = (cols, y) => {
      const totalW = cols.reduce((s, c) => s + c.w, 0);
      doc.rect(L, y, totalW, 22).fill(DARK2);
      let x = L;
      for (const col of cols) {
        doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE)
           .text(col.label, x + 6, y + 7, { width: col.w - 12, align: col.align || "left", lineBreak: false });
        x += col.w;
      }
      return y + 22;
    };

    const tblRow = (cols, cells, y, rowH, bgColor, accentColor) => {
      const totalW = cols.reduce((s, c) => s + c.w, 0);
      doc.rect(L, y, totalW, rowH).fill(bgColor);
      if (accentColor) doc.rect(L, y, 4, rowH).fill(accentColor);
      let x = L;
      for (let i = 0; i < cols.length; i++) {
        const padL = (i === 0 && accentColor) ? 12 : 6;
        doc.font("Helvetica").fontSize(9).fillColor(DARK)
           .text(String(cells[i] ?? "—"), x + padL, y + (rowH - 9) / 2, {
             width: cols[i].w - padL - 4,
             align: cols[i].align || "left",
             lineBreak: false,
           });
        x += cols[i].w;
      }
    };

    const tblTotalRow = (cols, cells, y) => {
      const totalW = cols.reduce((s, c) => s + c.w, 0);
      doc.rect(L, y, totalW, 24).fill(LIGHT);
      hr(y, ORANGE, 0.5);
      let x = L;
      for (let i = 0; i < cols.length; i++) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK)
           .text(String(cells[i] ?? "—"), x + 6, y + 7, {
             width: cols[i].w - 12,
             align: cols[i].align || "left",
             lineBreak: false,
           });
        x += cols[i].w;
      }
    };

    /* ── TOP BAR ── */
    doc.rect(0, 0, W, 14).fill(ORANGE);

    /* ── HEADER ── */
    doc.font("Helvetica-Bold").fontSize(15).fillColor(ORANGE)
       .text("Orange Digital Center", L, 22, { width: CW, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(GRAY)
       .text("Sénégal", L, 41, { width: CW, align: "center" });
    hr(58);

    /* ── TITRE ── */
    doc.font("Helvetica-Bold").fontSize(22).fillColor(DARK)
       .text("RAPPORT RADAR SOCIAL", L, 66, { width: CW, align: "center" });
    doc.font("Helvetica-Bold").fontSize(12).fillColor(ORANGE)
       .text(range.label, L, 94, { width: CW, align: "center" });
    doc.font("Helvetica").fontSize(8).fillColor(GRAY)
       .text(`Généré le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`,
             L, 112, { width: CW, align: "center" });

    /* ── SYNTHÈSE ── */
    let y = 132;
    y = sectionLabel("SYNTHÈSE DE LA PÉRIODE", y);
    y += 6;

    const kpiDefs = [
      { label: "Abonnés",   value: totals.followers },
      { label: "Portée",    value: totals.reach },
      { label: "Engagement", value: totals.engagement },
      { label: "Aud. unique", value: totals.unique_users },
      { label: "Résultats", value: totals.results },
    ];
    const boxW = (CW - 4 * 7) / 5;

    kpiDefs.forEach((k, i) => {
      const bx = L + i * (boxW + 7);
      doc.rect(bx, y, boxW, 54).fill(LIGHT2);
      doc.rect(bx, y, boxW, 3).fill(ORANGE);  // top accent
      doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
         .text(k.label.toUpperCase(), bx + 5, y + 10, { width: boxW - 10, align: "center" });
      doc.font("Helvetica-Bold").fontSize(18).fillColor(DARK)
         .text(formatCompact(k.value), bx + 5, y + 23, { width: boxW - 10, align: "center" });
    });
    y += 62;

    /* ── TABLE PLATEFORMES ── */
    y = sectionLabel("DÉTAIL PAR PLATEFORME", y);
    y += 6;

    const pCols = [
      { w: 100, label: "Plateforme",  align: "left"  },
      { w: 79,  label: "Abonnés",     align: "right" },
      { w: 79,  label: "Portée",      align: "right" },
      { w: 79,  label: "Engagement",  align: "right" },
      { w: 79,  label: "Aud. unique", align: "right" },
      { w: 79,  label: "Résultats",   align: "right" },
    ];

    y = tblHeader(pCols, y);

    platformData.forEach((p, i) => {
      const bg = i % 2 === 0 ? WHITE : LIGHT2;
      tblRow(pCols,
        [p.label, formatCompact(p.followers), formatCompact(p.reach),
         formatCompact(p.engagement), formatCompact(p.unique_users), formatCompact(p.results)],
        y, 22, bg, p.color
      );
      y += 22;
    });

    tblTotalRow(pCols,
      ["TOTAL", formatCompact(totals.followers), formatCompact(totals.reach),
       formatCompact(totals.engagement), formatCompact(totals.unique_users), formatCompact(totals.results)],
      y
    );
    y += 30;

    /* ── ÉVOLUTION MENSUELLE (pas pour rapport mensuel) ── */
    if (range.type !== "month" && monthly.length > 0) {
      const mCols = [
        { w: 90,  label: "Mois",        align: "left"  },
        { w: 81,  label: "Abonnés",     align: "right" },
        { w: 81,  label: "Portée",      align: "right" },
        { w: 81,  label: "Engagement",  align: "right" },
        { w: 81,  label: "Aud. unique", align: "right" },
        { w: 81,  label: "Résultats",   align: "right" },
      ];

      // Nouvelle page si besoin
      const needed = 26 + 22 + monthly.length * 20 + 40;
      if (y + needed > H - 60) {
        doc.addPage();
        doc.rect(0, 0, W, 14).fill(ORANGE);
        y = 30;
      }

      y = sectionLabel("ÉVOLUTION MENSUELLE", y);
      y += 6;
      y = tblHeader(mCols, y);

      monthly.forEach((m, i) => {
        if (y + 20 > H - 60) {
          doc.addPage();
          doc.rect(0, 0, W, 14).fill(ORANGE);
          y = 30;
          y = tblHeader(mCols, y);
        }
        const [yr, mo] = m.month.split("-");
        const label = `${MONTHS_FR[parseInt(mo, 10) - 1]} ${yr}`;
        const bg = i % 2 === 0 ? WHITE : LIGHT2;
        tblRow(mCols,
          [label, formatCompact(m.followers), formatCompact(m.reach),
           formatCompact(m.engagement), formatCompact(m.unique_users), formatCompact(m.results)],
          y, 20, bg, null
        );
        y += 20;
      });
    }

    /* ── FOOTER ── */
    const pageCount = doc.bufferedPageRange ? doc.bufferedPageRange().count : 1;
    // On accède à toutes les pages pour ajouter le footer
    for (let pg = 0; pg < pageCount; pg++) {
      doc.switchToPage(pg);
      const pH = doc.page.height;
      doc.rect(0, pH - 14, W, 14).fill(ORANGE);
      doc.font("Helvetica").fontSize(7.5).fillColor(GRAY)
         .text("Orange Digital Center Sénégal · Rapport confidentiel",
               L, pH - 30, { width: CW, align: "center" });
    }

    doc.end();
  });
}

module.exports = router;
