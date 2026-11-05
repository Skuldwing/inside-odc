const fs = require("fs");
const path = require("path");

/**
 * Une attestation dessinée à partir de la maquette de l'équipe.
 *
 * Jusqu'ici le document était entièrement tracé dans le code : pour changer un
 * cadre, une couleur, la place du nom, il fallait modifier un fichier
 * JavaScript. Les modèles ne permettaient que de remplacer quelques textes et
 * un logo sur un dessin figé.
 *
 * On part désormais de la maquette elle-même. Elle est dessinée dans
 * PowerPoint — l'outil que l'équipe connaît —, exportée en PDF, et déposée
 * telle quelle. Ce qui est imprimé est exactement ce qui a été dessiné :
 * polices, dégradés, ombres, filigranes, tout.
 *
 *
 * POURQUOI UN PDF ET NON LE .PPTX
 *
 * Convertir un PowerPoint demande LibreOffice sur le serveur : cinq cents
 * mégaoctets de plus, davantage de mémoire, des déploiements plus lents — et
 * si la construction échoue, c'est tout le serveur qui tombe, attestations,
 * espace bénéficiaire et suivi de projets compris. L'export PDF coûte un clic
 * à celui qui dessine et ne fait courir aucun de ces risques.
 *
 *
 * CE QUI EST REMPLACÉ
 *
 * Ce que la personne a écrit entre doubles accolades, et rien d'autre. On
 * aurait pu deviner — « ce gros texte centré doit être le nom » — mais une
 * devinette se trompe, et elle se trompe sur une attestation déjà partie. Un
 * marqueur ne laisse aucune ambiguïté : ce qui est remplacé est exactement ce
 * qui a été désigné.
 *
 *
 * LA LIMITE, DITE ICI PLUTÔT QUE DÉCOUVERTE
 *
 * Le texte du marqueur est dessiné dans le PDF : pour écrire le nom à sa
 * place, il faut d'abord le recouvrir. Le rectangle de recouvrement prend la
 * couleur indiquée sur le modèle, blanche par défaut. Sur un fond uni — le cas
 * d'un emplacement de nom — il est invisible. Sur un fond photographique ou
 * dégradé, il se verrait : c'est pourquoi l'écran affiche un aperçu dès le
 * dépôt, avec un nom d'exemple. Le défaut se voit en deux secondes, avant la
 * première attestation.
 *
 * Le recouvrement cache le marqueur à l'œil mais ne l'efface pas de la couche
 * de texte : un copier-coller depuis l'attestation reçue rendrait encore
 * « {{prenom}} », à côté du nom. Le retirer vraiment supposerait de réécrire
 * le flux de dessin — ce qui a été tenté puis abandonné : un export PowerPoint
 * encode son texte en codes de glyphes propres à chaque police embarquée, et
 * « {{prenom}} » n'y figure sous aucune forme reconnaissable. Le document
 * imprimé, lui, est exact, et c'est ce qu'on remet à quelqu'un.
 *
 * La police du marqueur, elle, ne peut pas être réutilisée : un PDF n'embarque
 * que les lettres dont il se sert, et « {{prenom}} » n'en contient que huit.
 * On choisit donc la police d'écriture par champ, parmi celles embarquées ici.
 */

/* Les polyfills de pdfjs v6, requis avant tout chargement : la bibliothèque
   s'appuie sur des méthodes de Uint8Array absentes avant Node 25. Le rapport
   mensuel les pose déjà ; on les repose, car l'ordre de chargement des deux
   modules n'est pas garanti. */
for (const [nom, calcul] of [
  ["toHex", function () { return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("hex"); }],
  ["toBase64", function () { return Buffer.from(this.buffer, this.byteOffset, this.byteLength).toString("base64"); }],
]) {
  if (typeof Uint8Array.prototype[nom] !== "function") {
    Object.defineProperty(Uint8Array.prototype, nom, {
      value: calcul, writable: true, configurable: true, enumerable: false,
    });
  }
}

function chargerPdfjs() {
  try {
    /* Build « legacy » : celui que pdfjs recommande pour Node. */
    return require("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    return require("pdfjs-dist");
  }
}

/* ===== CE QU'ON SAIT REMPLACER =====
 *
 * Liste fermée, et c'est voulu : un marqueur inventé ne doit pas partir tel
 * quel sur une attestation. Ce qui n'est pas dans cette liste est signalé à
 * l'écran au moment du dépôt, pas découvert par le destinataire.
 */
const VARIABLES = {
  prenom: { libelle: "Prénom du bénéficiaire", exemple: "Awa" },
  nom: { libelle: "Nom du bénéficiaire", exemple: "NDIAYE" },
  nom_complet: { libelle: "Prénom et nom", exemple: "Awa NDIAYE" },
  activite: { libelle: "Intitulé de la formation", exemple: "Initiation à l'intelligence artificielle" },
  date: { libelle: "Date de la séance", exemple: "12 mai 2026" },
  lieu: { libelle: "Lieu", exemple: "Dakar" },
  duree: { libelle: "Durée", exemple: "14 heures" },
  dispositif: { libelle: "Dispositif", exemple: "Tech Academy" },
  organisateur: { libelle: "Partenaire ou formateur", exemple: "École 221" },
  aujourdhui: { libelle: "Date d'édition du document", exemple: "4 novembre 2026" },
};

/* Les polices disponibles pour écrire par-dessus la maquette.
   « manuscrite » est la Caveat déjà embarquée pour l'ancien rendu. */
const POLICES = {
  helvetica: { libelle: "Sans empattement", standard: "Helvetica" },
  "helvetica-gras": { libelle: "Sans empattement, gras", standard: "HelveticaBold" },
  times: { libelle: "Avec empattements", standard: "TimesRoman" },
  "times-gras": { libelle: "Avec empattements, gras", standard: "TimesRomanBold" },
  manuscrite: {
    libelle: "Manuscrite",
    fichier: path.join(__dirname, "..", "assets", "fonts", "Caveat-Regular.ttf"),
  },
};

const POLICE_DEFAUT = "helvetica-gras";
const ALIGNEMENTS = ["gauche", "centre", "droite"];
const COULEUR_TEXTE_DEFAUT = "#0F172A";
const COULEUR_FOND_DEFAUT = "#FFFFFF";

const MARQUEUR = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
/* Le même, pour balayer une ligne entière sans se soucier du curseur. */
const MARQUEUR_GLOBAL = /\{\{\s*[a-zA-Z_]+\s*\}\}/g;

/* ===== LECTURE DE LA MAQUETTE ===== */

function teinte(hex, rgb) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  const n = parseInt(m ? m[1] : "000000", 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * Regrouper les morceaux de texte d'une page en lignes.
 *
 * Un PDF ne stocke pas des phrases : il stocke des morceaux, découpés là où
 * le dessinateur a changé de police, d'espacement ou de position. « {{prenom}} »
 * arrive donc régulièrement en trois morceaux — « {{ », « prenom », « }} » —
 * voire lettre par lettre. Chercher le marqueur morceau par morceau ne le
 * trouverait jamais : on reconstitue la ligne, on cherche dedans, puis on
 * revient aux morceaux pour savoir où elle se trouve.
 */
function lignesDeLaPage(contenu) {
  const parLigne = new Map();

  for (const item of contenu.items) {
    if (!item.str) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    /* Deux morceaux sur la même ligne de base appartiennent à la même ligne.
       On arrondit : un exposant ou un accent peut décaler d'un demi-point. */
    const cle = Math.round(y * 2) / 2;
    if (!parLigne.has(cle)) parLigne.set(cle, []);
    parLigne.get(cle).push({
      texte: item.str,
      x,
      y,
      largeur: item.width || 0,
      taille: Math.hypot(item.transform[0], item.transform[1]) || item.height || 12,
    });
  }

  const lignes = [];
  for (const morceaux of parLigne.values()) {
    morceaux.sort((a, b) => a.x - b.x);
    let texte = "";
    const reperes = [];
    for (const m of morceaux) {
      reperes.push({ debut: texte.length, fin: texte.length + m.texte.length, morceau: m });
      texte += m.texte;
    }
    lignes.push({ texte, reperes });
  }
  return lignes;
}


/**
 * Lire une maquette : ses pages, et les lignes qu'elle laisse à remplir.
 *
 *
 * POURQUOI LA LIGNE ET NON LE MARQUEUR SEUL
 *
 * Premier essai : repérer chaque marqueur et n'écrire que sur lui. Le résultat
 * était illisible dès qu'un marqueur partageait sa ligne avec du texte. Sur
 * « Le {{date}} à {{lieu}} », la date venait se superposer au mot « Le », et
 * le recouvrement mangeait une partie de la phrase.
 *
 * La cause est de fond : remplacer un mot au milieu d'une ligne en déplace
 * tous les suivants. Un PDF ne sait pas refaire sa mise en page — il ne
 * contient que des positions figées.
 *
 * On reprend donc la ligne entière : on l'efface, et on la réécrit avec les
 * valeurs à la place des marqueurs. « Le {{date}} à {{lieu}} » devient
 * « Le 12 mai 2026 à Dakar », d'un seul tenant, correctement espacé.
 *
 * Conséquence à connaître : les mots fixes de cette ligne sont réécrits avec
 * la police choisie ici, et non celle de la maquette. Pour une fidélité
 * parfaite, il suffit de placer le marqueur seul dans sa zone de texte — la
 * ligne ne contient alors que lui, et rien d'autre n'est retouché. L'aperçu
 * montre le résultat dans les deux cas.
 *
 * @returns {{pages: Array, zones: Array, inconnus: string[]}}
 */
async function analyserFond(octets) {
  const pdfjs = chargerPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(octets),
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;

  const pages = [];
  const zones = [];
  const inconnus = new Set();

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const vue = page.getViewport({ scale: 1 });
    pages.push({ numero: n, largeur: vue.width, hauteur: vue.height });

    for (const ligne of lignesDeLaPage(await page.getTextContent())) {
      MARQUEUR.lastIndex = 0;
      const cles = [];
      let trouve;
      while ((trouve = MARQUEUR.exec(ligne.texte)) !== null) {
        const cle = trouve[1].toLowerCase();
        if (VARIABLES[cle]) {
          if (!cles.includes(cle)) cles.push(cle);
        } else {
          inconnus.add(trouve[0]);
        }
      }
      if (!cles.length) continue;

      const morceaux = ligne.reperes.map((r) => r.morceau);
      const premier = morceaux[0];
      const dernier = morceaux[morceaux.length - 1];

      zones.push({
        id: `p${n}-${Math.round(premier.y)}-${Math.round(premier.x)}`,
        page: n,
        cles,
        /* La ligne telle qu'elle est écrite, marqueurs compris : c'est elle
           qu'on réécrira, valeurs substituées. */
        gabarit: ligne.texte,
        x: Math.round(premier.x * 100) / 100,
        y: Math.round(premier.y * 100) / 100,
        largeur: Math.round((dernier.x + dernier.largeur - premier.x) * 100) / 100,
        taille: Math.round(Math.max(...morceaux.map((m) => m.taille)) * 100) / 100,
        /* Vrai quand la ligne ne contient que des marqueurs : rien de fixe
           n'est alors réécrit, et la fidélité est totale. L'écran s'en sert
           pour prévenir sur les autres. */
        seul: ligne.texte.replace(MARQUEUR_GLOBAL, "").trim() === "",
        police: POLICE_DEFAUT,
        couleur: COULEUR_TEXTE_DEFAUT,
        alignement: "centre",
      });
    }
  }

  await doc.destroy?.();
  return { pages, zones, inconnus: [...inconnus] };
}

/* ===== ÉCRITURE ===== */

function normaliserZone(zone) {
  return {
    ...zone,
    police: POLICES[zone.police] ? zone.police : POLICE_DEFAUT,
    alignement: ALIGNEMENTS.includes(zone.alignement) ? zone.alignement : "centre",
    couleur: /^#?[0-9a-f]{6}$/i.test(String(zone.couleur || "")) ? zone.couleur : COULEUR_TEXTE_DEFAUT,
  };
}

/* La ligne, valeurs substituées.
   Un marqueur sans valeur disparaît au lieu de s'imprimer : « {{duree}} » sur
   une activité dont la durée n'est pas renseignée partirait sinon tel quel
   chez le bénéficiaire. Les espaces en double que cela laisse sont resserrés,
   sans quoi « Le  à Dakar » garderait son trou. */
function remplir(gabarit, valeurs) {
  return String(gabarit || "")
    .replace(MARQUEUR_GLOBAL, (m) => {
      const cle = m.replace(/[{}\s]/g, "").toLowerCase();
      return String(valeurs[cle] ?? "").trim();
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Écrire les valeurs sur la maquette.
 *
 * @param {Buffer} fond        le PDF déposé
 * @param {Array}  zones       ce qu'a trouvé « analyserFond », éventuellement
 *                             retouché à l'écran
 * @param {object} valeurs     { prenom: "Awa", ... }
 * @param {string} couleurFond la couleur du rectangle de recouvrement
 */
async function composerAttestation({ fond, zones = [], valeurs = {}, couleurFond = COULEUR_FOND_DEFAUT }) {
  const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");

  const doc = await PDFDocument.load(fond);
  doc.registerFontkit(fontkit);
  const pages = doc.getPages();

  /* Les polices ne sont embarquées qu'à la demande : embarquer la manuscrite
     sur une attestation qui ne s'en sert pas alourdirait chaque document. */
  const embarquees = new Map();
  const police = async (cle) => {
    if (embarquees.has(cle)) return embarquees.get(cle);
    const def = POLICES[cle] || POLICES[POLICE_DEFAUT];
    const f = def.fichier
      ? await doc.embedFont(fs.readFileSync(def.fichier), { subset: true })
      : await doc.embedFont(StandardFonts[def.standard]);
    embarquees.set(cle, f);
    return f;
  };

  const masque = teinte(couleurFond, rgb);

  for (const brute of zones) {
    const zone = normaliserZone(brute);
    const page = pages[(zone.page || 1) - 1];
    if (!page) continue;

    /* Effacer la ligne, toujours — y compris quand il ne reste rien à écrire.
       Sans cela, une ligne dont aucune valeur n'est connue garderait ses
       marqueurs imprimés. */
    const marge = zone.taille * 0.12;
    page.drawRectangle({
      x: zone.x - marge,
      y: zone.y - zone.taille * 0.3,
      width: zone.largeur + marge * 2,
      height: zone.taille * 1.3,
      color: masque,
    });

    const texte = remplir(zone.gabarit, valeurs);
    if (!texte) continue;

    const f = await police(zone.police);
    /* La ligne réécrite peut être plus longue que l'originale — un intitulé
       de formation tient rarement dans la place d'un marqueur. On réduit
       jusqu'à ce qu'elle tienne dans sa zone élargie, plutôt que de la
       laisser déborder sur le cadre de la maquette. */
    let taille = zone.taille;
    const largeurMax = Math.max(zone.largeur * 1.6, zone.largeur + 30);
    let largeur = f.widthOfTextAtSize(texte, taille);
    while (largeur > largeurMax && taille > 6) {
      taille -= 0.5;
      largeur = f.widthOfTextAtSize(texte, taille);
    }

    let x = zone.x;
    if (zone.alignement === "centre") x = zone.x + zone.largeur / 2 - largeur / 2;
    else if (zone.alignement === "droite") x = zone.x + zone.largeur - largeur;

    page.drawText(texte, {
      x, y: zone.y, size: taille, font: f, color: teinte(zone.couleur, rgb),
    });
  }

  return Buffer.from(await doc.save());
}

/* Les valeurs d'exemple, pour l'aperçu affiché au moment du dépôt. */
function valeursExemple() {
  const exemple = {};
  for (const [cle, def] of Object.entries(VARIABLES)) exemple[cle] = def.exemple;
  return exemple;
}

module.exports = {
  VARIABLES,
  POLICES,
  ALIGNEMENTS,
  COULEUR_TEXTE_DEFAUT,
  COULEUR_FOND_DEFAUT,
  analyserFond,
  composerAttestation,
  remplir,
  valeursExemple,
  /* Exportés pour les contrôles. */
  lignesDeLaPage,
};
