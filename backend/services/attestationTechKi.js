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
 *
 * Ce document porte l'identite de l'Orange Digital Center Senegal — logo,
 * nom et signature de la directrice du centre — alors que le reste de la
 * plateforme porte la sienne, « Inside ODC Senegal ». C'est voulu : le modele
 * est celui du centre, fourni par l'equipe, et c'est le centre qui delivre
 * l'attestation. L'outil ne fait que l'imprimer.
 *
 * Ne pas « harmoniser » avec config/identite.js : reproduire ce modele sous
 * une autre enseigne laisserait la signature de quelqu'un sous un nom qui
 * n'est pas le sien. Toute modification de ce fichier se demande d'abord.
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

  /* Le bas du bloc, pour ce qui vient se poser dessous : le nombre de
     lignes depend du texte, donc de l'intitule du module et du nom du
     dispositif. Un appelant qui n'en a pas besoin ignore la valeur. */
  return y + lignes.length * interligne;
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
 * @param {object} options.modele        textes et logo du dispositif ; a
 *                                       defaut, le modele Tech-Ki d'origine
 */
function genererAttestationTechKi({ participant = {}, module: intitule, date, lieu = "Dakar", modele = {} }) {
  /* Ce qui change d'un dispositif a l'autre vient du modele ; le reste — fond,
     cadre, decors, mise en page — est commun a toutes les attestations. Les
     valeurs d'origine servent de repli : un modele incomplet ne doit pas
     produire un document amput'e. */
  const M = {
    bandeauAvant: modele.bandeau_avant ?? "TECH-",
    bandeauApres: modele.bandeau_apres ?? "KI",
    programme: modele.programme ?? "Tech-Ki",
    organisation: modele.organisation ?? "Orange Digital Center",
    mention: modele.mention || null,
    signataireNom: modele.signataire_nom ?? "NAFISSATOU CHÉRIF NIANG",
    signataireFonction: modele.signataire_fonction ?? "Directrice de Orange Digital Center",
    logoPartenaire: modele.logo_partenaire || null,
  };

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

      /* ── Decors ──────────────────────────────────────────────────────────
         Quatre rectangles arrondis pivotes de 47,8 degres : un a gauche, qui
         deborde de la page, et trois au coin inferieur droit — un aplat
         orange, un cartouche noir, et le contour orange qui l'entoure. Ils
         manquaient entierement au rendu, et c'est sur le cartouche noir que se
         lit la devise du programme : sans lui, elle etait ecrite en blanc sur
         du blanc.
         Les mesures viennent des groupes du .pptx, qui portent la rotation ;
         le rayon des coins vient du trace de chaque forme. */
      const rectanglePivote = (cx, cy, l, h, rayon, angle, { fond, contour, epaisseur } = {}) => {
        doc.save();
        doc.rotate(angle, { origin: [cx, cy] });
        doc.roundedRect(cx - l / 2, cy - h / 2, l, h, rayon);
        if (fond) doc.fillColor(fond);
        if (contour) doc.lineWidth(epaisseur || 1).strokeColor(contour);
        if (fond && contour) doc.fillAndStroke();
        else if (fond) doc.fill();
        else doc.stroke();
        doc.restore();
      };

      const ANGLE_DECOR = 47.82;
      /* A gauche, a cheval sur le bord. */
      rectanglePivote(-0.149 * POUCE, 2.810 * POUCE, 2.020 * POUCE, 2.007 * POUCE,
        0.230 * POUCE, ANGLE_DECOR, { fond: ORANGE });
      /* Au coin inferieur droit, dans l'ordre du modele. */
      rectanglePivote(10.944 * POUCE, 6.805 * POUCE, 1.706 * POUCE, 1.822 * POUCE,
        0.230 * POUCE, ANGLE_DECOR, { fond: ORANGE });
      rectanglePivote(10.978 * POUCE, 7.474 * POUCE, 2.388 * POUCE, 2.083 * POUCE,
        0.164 * POUCE, ANGLE_DECOR, { fond: NOIR });
      rectanglePivote(10.985 * POUCE, 7.194 * POUCE, 2.644 * POUCE, 2.085 * POUCE,
        0.148 * POUCE, ANGLE_DECOR, { contour: ORANGE, epaisseur: 2.25 });

      /* Le trait oblique pose sur le decor de gauche. */
      doc.save()
        .lineWidth(1)
        .strokeColor(NOIR)
        .moveTo(-0.14 * POUCE, (3.15 + 1.21) * POUCE)
        .lineTo((-0.14 + 1.36) * POUCE, 3.15 * POUCE)
        .stroke()
        .restore();

      /* ── Logo Orange Digital Center ───────────────────────────────────── */
      doc.image(FICHIERS.logo, 0.68 * POUCE, 0.65 * POUCE, {
        width: 2.91 * POUCE,
        height: 1.08 * POUCE,
      });

      /* ── Bandeau, en haut a droite ─────────────────────────────────────
         Le logo du partenaire prend la place du bandeau texte quand il y en a
         un : c'est le meme emplacement, et les deux ensemble se marcheraient
         dessus. Il est mis a l'echelle pour tenir dans la zone sans
         deformation. */
      if (M.logoPartenaire) {
        const ZONE = { x: 8.35 * POUCE, y: 0.55 * POUCE, l: 2.70 * POUCE, h: 1.15 * POUCE };
        doc.image(M.logoPartenaire, ZONE.x, ZONE.y, {
          fit: [ZONE.l, ZONE.h],
          align: "right",
          valign: "center",
        });
      } else if (M.bandeauAvant || M.bandeauApres) {
        /* « TECH-KI » tenait a 35,8 points ; « TECH ACADEMY » debordait de la
           page. Le bandeau est donc cale a droite et reduit jusqu'a tenir dans
           la zone — un nom de programme long n'a pas a etre tronque. */
        const DROITE = 11.28 * POUCE;
        const ZONE = 2.95 * POUCE;
        let taille = 35.8;
        const mesurer = (t) => {
          doc.font("Helvetica-Bold").fontSize(t);
          return doc.widthOfString(M.bandeauAvant) + doc.widthOfString(M.bandeauApres);
        };
        while (taille > 14 && mesurer(taille) > ZONE) taille -= 0.5;
        const total = mesurer(taille);
        const depart = DROITE - total;
        /* Le bandeau reste cale sur la meme ligne de base quelle que soit sa
           taille, pour ne pas remonter vers le bord quand il rapetisse. */
        const y = (0.87 + (35.8 - taille) / 72 / 2) * POUCE;
        doc.fillColor(NOIR).text(M.bandeauAvant, depart, y, { lineBreak: false });
        doc.fillColor(ORANGE).text(
          M.bandeauApres, depart + doc.widthOfString(M.bandeauAvant), y, { lineBreak: false }
        );
      }

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

      /* Le modele empile quatre traits sous « Decernee a », le nom devant
         s'ecrire dessus comme sur du papier regle. Aucun n'est trace : sur un
         document imprime, le nom se lit mieux pose sur le vide que barre par
         des lignes destinees a une ecriture manuscrite. Le trait a pastilles,
         plus bas, marque deja la fin de la zone.
         LIGNE_NOM_Y reste la base sur laquelle le nom s'appuie, meme sans
         trait visible — ne pas retablir ces lignes « par fidelite au
         modele », c'est une decision. */
      const LIGNE_NOM_Y = 4.29 * POUCE;

      /* Sous la zone du nom, un trait bleu nuit termine par deux pastilles
         rondes — l'equivalent des extremites « oval » du modele. */
      const PUCE = 2.2;
      ligne(2.08 * POUCE, 4.43 * POUCE, 6.94 * POUCE, "#041321");
      doc.circle(2.08 * POUCE, 4.43 * POUCE, PUCE).fillColor("#041321").fill();
      doc.circle((2.08 + 6.94) * POUCE, 4.43 * POUCE, PUCE).fillColor("#041321").fill();

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
          { ...marque, texte: M.programme },
          { ...courant, texte: " de " },
          { ...marque, texte: M.organisation },
          { ...courant, texte: "." },
        ],
        { x: 2.39 * POUCE, largeur: 6.32 * POUCE, y: 5.49 * POUCE, interligne: 22 }
      );

      /* La mention du partenariat, sous la phrase. Un dispositif mene avec un
         tiers doit pouvoir le dire sur le document — c'est la raison d'etre
         des modeles. */
      if (M.mention) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(12)
          .fillColor(GRIS)
          .text(M.mention, 2.39 * POUCE, 6.02 * POUCE, {
            width: 6.32 * POUCE,
            align: "center",
            lineBreak: false,
            ellipsis: true,
          });
      }

      /* ── Signature ────────────────────────────────────────────────────── */
      doc.image(FICHIERS.signature, 1.32 * POUCE, 6.22 * POUCE, {
        width: 2.03 * POUCE,
        height: 0.90 * POUCE,
      });

      doc
        .font("Helvetica-Bold")
        .fontSize(12.5)
        .fillColor(NOIR)
        .text(M.signataireNom, 1.08 * POUCE, 6.98 * POUCE, { lineBreak: false });

      doc
        .font("Helvetica")
        .fontSize(10.5)
        .text(M.signataireFonction, 1.03 * POUCE, 7.25 * POUCE, { lineBreak: false });

      doc
        .fontSize(10)
        .fillColor(GRIS)
        .text("Fait à :", 6.08 * POUCE, 6.98 * POUCE, { lineBreak: false });

      /* ── Signature Tech-Ki, sur le bandeau orange de droite ───────────── */
      /* En blanc, comme le modele : elle se lit sur le cartouche noir du coin
         inferieur droit, qui est desormais trace. */
      doc
        .font("Helvetica-BoldOblique")
        .fontSize(10)
        .fillColor("#FFFFFF")
        .text("Le coup de pouce numérique pour tous", 10.05 * POUCE, 6.92 * POUCE, {
          width: 1.39 * POUCE,
          align: "left",
          lineGap: 1,
        });

      ligne(10.05 * POUCE, 7.46 * POUCE, 0.27 * POUCE, ORANGE);

      /* La virgule qui ferme la proposition : « ... formation pratique sur
         [module], organisee dans le cadre du programme... ». Elle est posee au
         bout de la ligne du module, comme dans le modele. */
      doc
        .font("Helvetica-Bold")
        .fontSize(16.8)
        .fillColor(NOIR)
        .text(",", 8.44 * POUCE, 5.08 * POUCE, {
          width: 0.63 * POUCE,
          align: "center",
        });

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

      /* La date etait ecrite nettement plus petit que le nom et le module.
         A 17 points elle remplissait deja la ligne : monter la taille seule
         n'aurait rien change, la reduction automatique l'aurait ramenee la.
         On elargit donc la zone d'ecriture au-dela du trait — jusqu'a 9,20
         pouces, ce qui laisse le cartouche noir tranquille, il commence a
         9,32 — et on vise 21 points. Une date longue redescend a 19, une
         date courte garde 21. */
      const mention = [lieu, dateEnToutesLettres(date)].filter(Boolean).join(", le ");
      ecrireManuscrit(doc, mention, {
        x: 6.64 * POUCE,
        largeur: 2.56 * POUCE,
        ligneY: LIGNE_DATE_Y,
        taille: 21,
        plancher: 12,
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

/* Les outils de mise en page sont partages avec le modele Kids Tech : meme
   maniere de composer une phrase a plusieurs styles, meme ecriture manuscrite
   posee sur une ligne. Les exporter ne change rien a ce document — le dessin
   ci-dessus reste intact. */
module.exports = {
  genererAttestationTechKi,
  ressourcesPresentes,
  dateEnToutesLettres,
  nomComplet,
  tailleQuiTient,
  paragrapheRiche,
  ecrireManuscrit,
};
