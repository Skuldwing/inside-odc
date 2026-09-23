const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const {
  dateEnToutesLettres, nomComplet, paragrapheRiche, ecrireManuscrit,
} = require("./attestationTechKi");

/**
 * Attestation au modele Kids Tech, fourni par l'equipe.
 *
 * Meme role que le modele Tech-Ki, autre public : celui-ci s'adresse a des
 * enfants. D'ou l'illustration qui occupe toute la moitie gauche, le lavis
 * arc-en-ciel, la medaille, et la devise « Je cree / Je code / Je brille ».
 * Une attestation de Super Codeur remise a un enfant de dix ans n'a pas a
 * ressembler a celle d'un adulte en formation professionnelle.
 *
 * Les positions viennent du .pptx d'origine, relevees en pouces sur la
 * diapositive (11,69 x 8,27 — A4 paysage). PDFKit travaille en points :
 * 1 pouce = 72 points.
 *
 * Comme le modele Tech-Ki, ce document porte l'identite de l'Orange Digital
 * Center Senegal — logo, signature de la directrice — et non celle de la
 * plateforme : c'est le centre qui delivre l'attestation, l'outil ne fait que
 * l'imprimer.
 */

const POUCE = 72;
const LARGEUR = 11.69 * POUCE;
const HAUTEUR = 8.27 * POUCE;

const ORANGE = "#FF7900";
const NOIR = "#000000";
const GRIS = "#404654";

const ASSETS = path.join(__dirname, "..", "assets", "attestation");
const FICHIERS = {
  fond: path.join(ASSETS, "kids", "fond.jpg"),
  arcEnCiel: path.join(ASSETS, "kids", "arc-en-ciel.jpg"),
  enfants: path.join(ASSETS, "kids", "enfants.png"),
  medaille: path.join(ASSETS, "kids", "medaille.png"),
  logo: path.join(ASSETS, "kids", "logo.png"),
  curseur: path.join(ASSETS, "kids", "curseur.png"),
  etoiles: path.join(ASSETS, "kids", "etoiles.png"),
  ampoule: path.join(ASSETS, "kids", "ampoule.png"),
  nuage: path.join(ASSETS, "kids", "nuage.png"),
  /* La signature vient du modele Kids Tech, pas de celle du Tech-Ki : c'est la
     meme personne, mais le detourage n'est pas le meme et celui-ci remplit la
     boite prevue. */
  signature: path.join(ASSETS, "kids", "signature.png"),
  manuscrite: path.join(ASSETS, "..", "fonts", "Caveat-Regular.ttf"),
};

/* La carte interieure, sur laquelle tout se pose, et la couche orange qu'elle
   recouvre : decalee de 0,10 pouce vers le bas et la droite, elle depasse sur
   ces deux cotes et fait l'ombre portee du modele. */
const CARTE = { x: 0.38, y: 0.45, l: 10.99, h: 7.42 };
const OMBRE = { x: 0.48, y: 0.57, l: 10.99, h: 7.42 };

/**
 * @param {object} options
 * @param {object} options.participant  { nom, prenom }
 * @param {string} options.module       intitule de la formation suivie
 * @param {string|Date} options.date    date de l'activite
 * @param {string} options.lieu         ville, « Dakar » par defaut
 * @param {object} options.modele       textes et logo du dispositif
 */
function genererAttestationKidsTech({
  participant = {}, module: intitule, date, lieu = "Dakar", modele = {},
}) {
  /* Dans ce modele, le bandeau n'est pas un mot coupe en deux comme dans le
     Tech-Ki : c'est un surtitre discret et un grand mot dessous. « ATTESTATION
     DE » puis « PARTICIPATION » — ou « SUPER CODEUR », qui est justement ce
     qu'on veut pouvoir ecrire ici. */
  const M = {
    surtitre: modele.bandeau_avant ?? "ATTESTATION DE",
    titre: modele.bandeau_apres ?? "PARTICIPATION",
    programme: modele.programme ?? "Kids Tech",
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

      /* ── Fond ────────────────────────────────────────────────────────── */
      doc.image(FICHIERS.fond, -0.12 * POUCE, -0.12 * POUCE, {
        width: 11.94 * POUCE, height: 8.52 * POUCE,
      });

      /* ── Carte blanche et lavis arc-en-ciel ───────────────────────────
         Le modele pose l'arc-en-ciel a 16 % d'opacite sur un aplat blanc :
         c'est ce qui donne le lavis pastel sans rendre le texte illisible.
         A pleine opacite, le document serait un arc-en-ciel avec du texte
         noir dessus — ce n'est pas ce que montre le modele. */
      const carte = () =>
        doc.rect(CARTE.x * POUCE, CARTE.y * POUCE, CARTE.l * POUCE, CARTE.h * POUCE);

      doc
        .rect(OMBRE.x * POUCE, OMBRE.y * POUCE, OMBRE.l * POUCE, OMBRE.h * POUCE)
        .fillColor(ORANGE)
        .fill();
      carte().fillColor("#FFFFFF").fill();

      doc.save();
      carte().clip();
      doc.fillOpacity(0.16);
      doc.image(FICHIERS.arcEnCiel, CARTE.x * POUCE, CARTE.y * POUCE, {
        width: CARTE.l * POUCE, height: CARTE.h * POUCE,
      });
      doc.fillOpacity(1);
      doc.restore();

      /* ── Filets orange ───────────────────────────────────────────────
         Deux horizontaux dans la carte, deux verticaux plus bas : ensemble ils
         dessinent un cadre ouvert aux quatre coins, ou se posent les curseurs. */
      /* Tirets, pas un trait plein : c'est ce que trace le modele
         (« sysDash », soit trois fois l'epaisseur du trait puis un blanc). */
      const filet = (x1, y1, x2, y2, epaisseur) => {
        doc.save();
        doc.lineWidth(epaisseur).strokeColor(ORANGE).lineCap("round")
          .dash(epaisseur * 3, { space: epaisseur })
          .moveTo(x1 * POUCE, y1 * POUCE).lineTo(x2 * POUCE, y2 * POUCE).stroke();
        doc.undash();
        doc.restore();
      };

      filet(0.71, 0.64, 11.04, 0.64, 2);
      filet(0.74, 7.70, 10.99, 7.70, 2);
      filet(0.58, 1.07, 0.58, 7.28, 1.5);
      filet(11.19, 1.07, 11.19, 7.28, 1.5);

      /* ── Plages claires ───────────────────────────────────────────────
         Trois taches blanches a 64 % attenuent le lavis la ou se posent le
         logo, la medaille et la signature : sans elles, ces trois elements se
         lisent sur un fond colore. */
      const nuage = (x, y, l, h, angle) => {
        doc.save();
        if (angle) {
          doc.rotate(angle, { origin: [(x + l / 2) * POUCE, (y + h / 2) * POUCE] });
        }
        doc.fillOpacity(0.64);
        doc.image(FICHIERS.nuage, x * POUCE, y * POUCE, {
          width: l * POUCE, height: h * POUCE,
        });
        doc.restore();
      };
      nuage(0.71, 6.21, 2.12, 1.29, 0);
      nuage(9.33, 0.73, 1.97, 1.19, 33.9);
      nuage(9.34, 6.33, 2.04, 1.23, 150.2);

      /* ── Décors ──────────────────────────────────────────────────────── */
      doc.image(FICHIERS.enfants, 0.43 * POUCE, 0.40 * POUCE, {
        width: 4.85 * POUCE, height: 7.28 * POUCE,
      });
      doc.image(FICHIERS.medaille, 10.13 * POUCE, 1.03 * POUCE, {
        width: 0.66 * POUCE, height: 0.79 * POUCE,
      });

      /* Les curseurs des deux coins gauches pointent vers l'interieur : le
         modele les retourne horizontalement. */
      const curseur = (x, y, miroir) => {
        doc.save();
        if (miroir) {
          doc.translate((x + 0.26) * POUCE, 0).scale(-1, 1, { origin: [0, 0] });
          doc.image(FICHIERS.curseur, -0.26 * POUCE, y * POUCE, {
            width: 0.26 * POUCE, height: 0.44 * POUCE,
          });
        } else {
          doc.image(FICHIERS.curseur, x * POUCE, y * POUCE, {
            width: 0.26 * POUCE, height: 0.44 * POUCE,
          });
        }
        doc.restore();
      };
      curseur(0.48, 0.64, true);
      curseur(11.04, 0.63, false);
      curseur(0.57, 7.25, false);
      curseur(10.95, 7.28, true);

      /* ── Devise ───────────────────────────────────────────────────────
         « Je crée · Je code · Je brille », en haut de l'illustration. */
      doc.image(FICHIERS.ampoule, 1.98 * POUCE, 0.89 * POUCE, {
        width: 0.20 * POUCE, height: 0.20 * POUCE,
      });
      doc.font("Helvetica-Bold").fontSize(6.45).fillColor(NOIR);
      doc.text("Je crée", 2.27 * POUCE, 0.94 * POUCE, { lineBreak: false });
      doc.text("Je code", 2.75 * POUCE, 0.94 * POUCE, { lineBreak: false });
      doc.text("Je brille", 3.23 * POUCE, 0.94 * POUCE, { lineBreak: false });
      doc.image(FICHIERS.etoiles, 3.71 * POUCE, 0.89 * POUCE, {
        width: 0.22 * POUCE, height: 0.22 * POUCE,
      });

      /* ── Titre ────────────────────────────────────────────────────────
         Le grand mot se resserre s'il est long : « PARTICIPATION » tient a
         49,9 pt, « SUPER CODEUR » aussi, mais un intitule plus long
         deborderait de la carte. */
      const ZONE_TITRE = { x: 4.72 * POUCE, l: 5.60 * POUCE };
      /* Le surtitre est interlettre dans le modele : « A T T E S T A T I O N
         D E ». Sans cet ecart, la ligne est beaucoup plus courte et le
         document ne se reconnait pas. */
      doc.font("Helvetica").fontSize(20.85).fillColor(NOIR)
        .text(M.surtitre, ZONE_TITRE.x, 1.22 * POUCE, {
          width: ZONE_TITRE.l, align: "center", lineBreak: false, ellipsis: true,
          characterSpacing: 6.25,
        });

      /* Le modele compose « PARTICIPATION » a 49,86 pt dans un Helvetica Now
         Bold, plus etroit que l'Helvetica des polices standard du PDF : le meme
         corps donne ici un mot 5 % plus large, qui vient frôler la medaille. On
         cale donc sur la largeur du modele — 4,95 pouces — plutot que sur le
         corps : le grand mot occupe la meme bande quelle que soit sa longueur,
         et un titre plus long se resserre au lieu de deborder. */
      const LARGEUR_TITRE = 4.95 * POUCE;
      doc.font("Helvetica-Bold");
      let tailleTitre = 49.86;
      while (tailleTitre > 24 && doc.fontSize(tailleTitre).widthOfString(M.titre) > LARGEUR_TITRE) {
        tailleTitre -= 0.5;
      }
      doc.fontSize(tailleTitre).fillColor(NOIR)
        .text(M.titre, ZONE_TITRE.x, 1.76 * POUCE, {
          width: ZONE_TITRE.l, align: "center", lineBreak: false,
        });

      /* ── « … certifie que » ───────────────────────────────────────────
         Le modèle d'origine portait « Nous soussignés, Orange Digital
         Center, certifions que ». La formule est bancale : « nous
         soussignés » désigne des personnes qui signent, pas une
         structure, et elle impose un pluriel là où une seule entité
         atteste. On s'en tient à l'attestation elle-même. */
      const petit = { police: "Helvetica", taille: 12.99, couleur: NOIR };
      const petitGras = { police: "Helvetica-Bold", taille: 12.99, couleur: NOIR };
      const petitOrange = { police: "Helvetica-Bold", taille: 12.99, couleur: ORANGE };
      const premierMot = M.organisation.split(" ")[0];
      const resteDuNom = M.organisation.split(" ").slice(1).join(" ");
      paragrapheRiche(
        doc,
        [
          { ...petitOrange, texte: premierMot },
          ...(resteDuNom ? [{ ...petitGras, texte: " " + resteDuNom }] : []),
          { ...petit, texte: " certifie que" },
        ],
        { x: 4.80 * POUCE, largeur: 5.43 * POUCE, y: 2.88 * POUCE, interligne: 18 }
      );

      /* ── Ligne du nom ─────────────────────────────────────────────────
         Le modèle en portait quatre, comme du papier réglé : il était fait
         pour être rempli à la main. Ici le nom est imprimé, une seule ligne
         suffit — celle sur laquelle il repose. Les trois autres traversaient
         le nom et le rendaient moins lisible. */
      const LIGNE_NOM = 3.87;
      doc.save();
      doc.lineWidth(0.75).strokeColor(NOIR).lineCap("butt").dash(0.75, { space: 0.75 });
      doc.moveTo(5.37 * POUCE, LIGNE_NOM * POUCE)
        .lineTo((5.37 + 4.68) * POUCE, LIGNE_NOM * POUCE).stroke();
      doc.undash();
      doc.restore();
      ecrireManuscrit(doc, nomComplet(participant), {
        x: 5.37 * POUCE, largeur: 4.68 * POUCE, ligneY: LIGNE_NOM * POUCE, taille: 30, plancher: 15,
      });

      /* ── « a participé au programme… » ────────────────────────────────── */
      const corps = { police: "Helvetica", taille: 14.24, couleur: NOIR };
      const corpsGras = { police: "Helvetica-Bold", taille: 14.24, couleur: NOIR };
      const corpsOrange = { police: "Helvetica-Bold", taille: 14.24, couleur: ORANGE };
      const quand = dateEnToutesLettres(date);
      paragrapheRiche(
        doc,
        [
          { ...corps, texte: "a participé au programme " },
          { ...corpsOrange, texte: M.programme },
          ...(intitule ? [{ ...corps, texte: ", module " }, { ...corpsGras, texte: intitule }] : []),
          { ...corps, texte: quand ? `, le ${quand}` : "" },
          { ...corps, texte: " à " },
          { ...corpsGras, texte: M.organisation },
          { ...corps, texte: "." },
        ].filter((s) => s.texte),
        { x: 5.39 * POUCE, largeur: 4.25 * POUCE, y: 4.16 * POUCE, interligne: 20 }
      );

      /* La mention du partenariat : un dispositif mené avec un tiers doit
         pouvoir le dire sur le document. */
      if (M.mention) {
        doc.font("Helvetica-Oblique").fontSize(10).fillColor(GRIS)
          .text(M.mention, 5.39 * POUCE, 5.20 * POUCE, {
            width: 4.25 * POUCE, align: "center", lineBreak: false, ellipsis: true,
          });
      }

      /* ── « Fait à : » ─────────────────────────────────────────────────── */
      doc.font("Helvetica").fontSize(10).fillColor(GRIS)
        .text("Fait à :", 5.92 * POUCE, 5.90 * POUCE, { lineBreak: false, characterSpacing: 0.4 });
      doc.save();
      doc.lineWidth(0.75).strokeColor(NOIR).lineCap("butt").dash(0.75, { space: 0.75 })
        .moveTo(6.49 * POUCE, 6.02 * POUCE).lineTo((6.49 + 2.36) * POUCE, 6.02 * POUCE).stroke();
      doc.undash();
      doc.restore();
      ecrireManuscrit(doc, [lieu, quand].filter(Boolean).join(", le "), {
        x: 6.49 * POUCE, largeur: 2.36 * POUCE, ligneY: 6.02 * POUCE, taille: 15, plancher: 9,
      });

      /* ── Signature ───────────────────────────────────────────────────── */
      /* La boite du modele descend jusqu'au nom de la signataire : l'image
         d'origine s'arretait avant, la notre est detouree au plus juste. On la
         remonte donc, sinon le trait de plume barre le nom. */
      doc.image(FICHIERS.signature, 8.83 * POUCE, 6.47 * POUCE, {
        fit: [1.61 * POUCE, 0.62 * POUCE], align: "center", valign: "top",
      });
      doc.font("Helvetica-Bold").fontSize(9.87).fillColor(NOIR)
        .text(M.signataireNom, 8.28 * POUCE, 7.17 * POUCE, {
          width: 2.55 * POUCE, align: "center", lineBreak: false, ellipsis: true,
          characterSpacing: 0.29,
        });
      doc.font("Helvetica").fontSize(8.35).fillColor(NOIR)
        .text(M.signataireFonction, 8.23 * POUCE, 7.38 * POUCE, {
          width: 2.64 * POUCE, align: "center", lineBreak: false, ellipsis: true,
          characterSpacing: 0.25,
        });

      /* ── Logos ───────────────────────────────────────────────────────
         Seul, le logo du centre occupe toute la plage claire. Avec un logo de
         partenaire, il lui cede la moitie droite : a pleine largeur, les deux
         se chevauchaient. */
      const avecPartenaire = Boolean(M.logoPartenaire);
      doc.image(FICHIERS.logo, 0.83 * POUCE, 6.70 * POUCE, {
        fit: [(avecPartenaire ? 1.30 : 2.17) * POUCE, 0.74 * POUCE],
        align: "left", valign: "center",
      });

      if (avecPartenaire) {
        try {
          doc.image(M.logoPartenaire, 2.20 * POUCE, 6.76 * POUCE, {
            fit: [0.58 * POUCE, 0.62 * POUCE], align: "center", valign: "center",
          });
        } catch (e) {
          /* Un logo illisible ne doit pas empecher la delivrance du document. */
          console.warn("[ATTESTATION KIDS TECH] logo partenaire ignoré :", e.message);
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* Ce qui manque pour dessiner ce modele, liste vide s'il est complet — meme
   convention que le modele Tech-Ki, pour que l'aiguillage puisse interroger
   les deux de la meme facon. */
function ressourcesPresentes() {
  return Object.entries(FICHIERS)
    .filter(([, chemin]) => !fs.existsSync(chemin))
    .map(([nom]) => nom);
}

module.exports = { genererAttestationKidsTech, ressourcesPresentes };
