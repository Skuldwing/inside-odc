const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

/**
 * Attestation de participation, au modele Tech-Ki fourni par l'equipe.
 *
 * Le modele d'origine est un PowerPoint dont les champs variables — le nom, le
 * module et la date — sont des lignes vierges, remplies a la main. On reproduit
 * ici la mise en page a l'identique et on ecrit ces trois champs dans une
 * police manuscrite : le document garde l'aspect d'une attestation signee,
 * sans qu'on ait a imprimer puis remplir chaque exemplaire.
 *
 * Les positions viennent du .pptx, en pouces, relevees sur la diapositive
 * (11,69 x 8,27 pouces, soit A4 paysage). PDFKit travaille en points
 * typographiques : 1 pouce = 72 points.
 */

const POUCE = 72;
const LARGEUR = 11.69 * POUCE;
const HAUTEUR = 8.27 * POUCE;

const ORANGE = "#FF7900";
const NOIR = "#000000";
const GRIS = "#404654";
const ENCRE = "#1B3C8C"; // bleu stylo, comme la signature du modele

const ASSETS = path.join(__dirname, "..", "assets");
const FICHIERS = {
  fond: path.join(ASSETS, "attestation", "fond.jpg"),
  logo: path.join(ASSETS, "attestation", "logo-odc.png"),
  signature: path.join(ASSETS, "attestation", "signature.png"),
  manuscrite: path.join(ASSETS, "fonts", "Caveat-Regular.ttf"),
};

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function dateEnToutesLettres(valeur) {
  const d = valeur ? new Date(valeur) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

function nomComplet(participant = {}) {
  const parties = [participant.prenom, participant.nom]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return parties.join(" ") || String(participant.full_name || "").trim();
}

/* Un nom trop long deborderait de la ligne. Plutot que de le couper, on reduit
   la taille jusqu'a ce qu'il tienne — comme on ecrirait plus serre a la main. */
function tailleQuiTient(doc, texte, largeurMax, tailleIdeale, taillePlancher) {
  let taille = tailleIdeale;
  while (taille > taillePlancher && doc.fontSize(taille).widthOfString(texte) > largeurMax) {
    taille -= 1;
  }
  return taille;
}

/* Rend une phrase melant plusieurs styles, centree et repliee sur plusieurs
   lignes si besoin.

   PDFKit propose « continued: true » pour enchainer des styles, mais chaque
   morceau est alors centre pour lui-meme : les segments se chevauchent. On
   mesure donc mot a mot, on compose les lignes, puis on les dessine. */
function paragrapheRiche(doc, segments, { x, largeur, y, interligne }) {
  const mots = [];
  for (const seg of segments) {
    const parts = seg.texte.split(/(\s+)/).filter((m) => m !== "");
    for (const m of parts) mots.push({ ...seg, texte: m });
  }

  const largeurDe = (mot) => {
    doc.font(mot.police).fontSize(mot.taille);
    return doc.widthOfString(mot.texte);
  };

  const lignes = [];
  let courante = [];
  let largeurCourante = 0;

  for (const mot of mots) {
    const l = largeurDe(mot);
    const estEspace = /^\s+$/.test(mot.texte);
    if (!estEspace && largeurCourante + l > largeur && courante.length) {
      /* On ne garde pas l'espace en fin de ligne. */
      while (courante.length && /^\s+$/.test(courante[courante.length - 1].texte)) courante.pop();
      lignes.push(courante);
      courante = [];
      largeurCourante = 0;
    }
    if (estEspace && !courante.length) continue;
    courante.push({ ...mot, largeur: l });
    largeurCourante += l;
  }
  if (courante.length) lignes.push(courante);

  lignes.forEach((ligne, i) => {
    const totale = ligne.reduce((s, m) => s + m.largeur, 0);
    let curseur = x + (largeur - totale) / 2;
    const yLigne = y + i * interligne;
    for (const mot of ligne) {
      doc.font(mot.police).fontSize(mot.taille).fillColor(mot.couleur);
      doc.text(mot.texte, curseur, yLigne, { lineBreak: false });
      curseur += mot.largeur;
    }
  });
}

function ecrireManuscrit(doc, texte, { x, largeur, ligneY, taille, plancher = 14 }) {
  if (!texte) return;
  doc.font("manuscrite").fillColor(ENCRE);
  const t = tailleQuiTient(doc, texte, largeur, taille, plancher);
  doc.fontSize(t);
  /* Le texte repose sur la ligne : on remonte de la hauteur de la police,
     plus un souffle, pour ne pas ecrire dessus. */
  doc.text(texte, x, ligneY - t * 0.92, { width: largeur, align: "center" });
}

/**
 * @param {object} options
 * @param {object} options.participant  { nom, prenom }
 * @param {string} options.module       intitule de la formation suivie
 * @param {string|Date} options.date    date de l'activite
 * @param {string} options.lieu         ville, « Dakar » par defaut
 */
function genererAttestationTechKi({ participant = {}, module: intitule, date, lieu = "Dakar" }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [LARGEUR, HAUTEUR],
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: {
        Title: "Attestation de participation",
        Author: "Orange Digital Center Sénégal",
      },
    });

    const morceaux = [];
    doc.on("data", (c) => morceaux.push(c));
    doc.on("end", () => resolve(Buffer.concat(morceaux)));
    doc.on("error", reject);

    try {
      doc.registerFont("manuscrite", FICHIERS.manuscrite);

      /* ── Fond et cadre ────────────────────────────────────────────────── */
      doc.image(FICHIERS.fond, 0, 0, { width: LARGEUR, height: HAUTEUR });

      /* Le modele pose le cadre orange avec deux images rognees ; un trace
         donne exactement le meme resultat, sans les deux images. */
      doc
        .lineWidth(2.5)
        .strokeColor(ORANGE)
        .rect(0.16 * POUCE, 0.16 * POUCE, LARGEUR - 0.32 * POUCE, HAUTEUR - 0.32 * POUCE)
        .stroke();

      /* ── Logo Orange Digital Center ───────────────────────────────────── */
      doc.image(FICHIERS.logo, 0.68 * POUCE, 0.65 * POUCE, {
        width: 2.91 * POUCE,
        height: 1.08 * POUCE,
      });

      /* ── Bandeau Tech-Ki, en haut a droite ────────────────────────────── */
      doc.font("Helvetica-Bold").fontSize(35.8);
      doc.fillColor(NOIR).text("TECH-", 8.90 * POUCE, 0.87 * POUCE, { lineBreak: false });
      const largeurTech = doc.widthOfString("TECH-");
      doc.fillColor(ORANGE).text("KI", 8.90 * POUCE + largeurTech, 0.87 * POUCE, { lineBreak: false });

      /* ── Titre ────────────────────────────────────────────────────────── */
      doc
        .font("Times-Bold")
        .fontSize(53.2)
        .fillColor(NOIR)
        .text("ATTESTATION", 2.53 * POUCE, 1.81 * POUCE, {
          width: 6.35 * POUCE,
          align: "center",
          characterSpacing: 1.5,
        });

      doc
        .font("Helvetica")
        .fontSize(19.3)
        .text("DE PARTICIPATION", 3.91 * POUCE, 2.78 * POUCE, {
          width: 3.59 * POUCE,
          align: "center",
          characterSpacing: 1,
        });

      doc
        .fontSize(14.5)
        .text("Décernée à", 3.35 * POUCE, 3.22 * POUCE, {
          width: 4.70 * POUCE,
          align: "center",
        });

      /* ── Lignes a remplir ─────────────────────────────────────────────── */
      const ligne = (x, y, largeur, couleur = NOIR) => {
        doc
          .lineWidth(0.8)
          .strokeColor(couleur)
          .moveTo(x, y)
          .lineTo(x + largeur, y)
          .stroke();
      };

      const LIGNE_NOM_Y = 4.29 * POUCE;
      ligne(2.35 * POUCE, LIGNE_NOM_Y, 6.41 * POUCE);

      const LIGNE_MODULE_Y = 5.31 * POUCE;
      ligne(2.36 * POUCE, LIGNE_MODULE_Y, 6.41 * POUCE);

      const LIGNE_DATE_Y = 7.13 * POUCE;
      ligne(6.64 * POUCE, LIGNE_DATE_Y, 2.36 * POUCE);

      /* ── Texte courant ────────────────────────────────────────────────── */
      doc
        .font("Helvetica")
        .fontSize(16.8)
        .fillColor(NOIR)
        .text("Pour avoir participé à une session gratuite de formation pratique sur",
          1.51 * POUCE, 4.58 * POUCE, { width: 8.08 * POUCE, align: "center" });

      const courant = { police: "Helvetica", taille: 16.8, couleur: NOIR };
      const marque = { police: "Helvetica-Bold", taille: 16.8, couleur: ORANGE };
      paragrapheRiche(
        doc,
        [
          { ...courant, texte: "organisée dans le cadre du programme " },
          { ...marque, texte: "Tech-Ki" },
          { ...courant, texte: " de " },
          { ...marque, texte: "Orange Digital Center" },
          { ...courant, texte: "." },
        ],
        { x: 2.39 * POUCE, largeur: 6.32 * POUCE, y: 5.49 * POUCE, interligne: 22 }
      );

      /* ── Signature ────────────────────────────────────────────────────── */
      doc.image(FICHIERS.signature, 1.32 * POUCE, 6.22 * POUCE, {
        width: 2.03 * POUCE,
        height: 0.90 * POUCE,
      });

      doc
        .font("Helvetica-Bold")
        .fontSize(12.5)
        .fillColor(NOIR)
        .text("NAFISSATOU CHÉRIF NIANG", 1.08 * POUCE, 6.98 * POUCE, { lineBreak: false });

      doc
        .font("Helvetica")
        .fontSize(10.5)
        .text("Directrice de Orange Digital Center", 1.03 * POUCE, 7.25 * POUCE, { lineBreak: false });

      doc
        .fontSize(10)
        .fillColor(GRIS)
        .text("Fait à :", 6.08 * POUCE, 6.98 * POUCE, { lineBreak: false });

      /* ── Les trois champs variables, a la main ────────────────────────── */
      ecrireManuscrit(doc, nomComplet(participant), {
        x: 2.35 * POUCE,
        largeur: 6.41 * POUCE,
        ligneY: LIGNE_NOM_Y,
        taille: 34,
        plancher: 18,
      });

      ecrireManuscrit(doc, intitule || "", {
        x: 2.36 * POUCE,
        largeur: 6.41 * POUCE,
        ligneY: LIGNE_MODULE_Y,
        taille: 26,
        plancher: 14,
      });

      const mention = [lieu, dateEnToutesLettres(date)].filter(Boolean).join(", le ");
      ecrireManuscrit(doc, mention, {
        x: 6.64 * POUCE,
        largeur: 2.36 * POUCE,
        ligneY: LIGNE_DATE_Y,
        taille: 17,
        plancher: 10,
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* Permet aux routes de refuser proprement si une ressource manque, plutot que
   d'echouer au milieu de la generation. */
function ressourcesPresentes() {
  return Object.entries(FICHIERS)
    .filter(([, chemin]) => !fs.existsSync(chemin))
    .map(([nom]) => nom);
}

module.exports = { genererAttestationTechKi, ressourcesPresentes };
