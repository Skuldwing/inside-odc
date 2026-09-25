const ExcelJS = require("exceljs");

/**
 * Le modele de liste de presence.
 *
 * C'est la premiere chose qu'un partenaire voit de la plateforme, et souvent
 * la seule. Il le telecharge, le remplit a la main ou le fait remplir en
 * salle, et nous le renvoie. Tout ce qui arrive ensuite dans la base est
 * passe par ce fichier.
 *
 * Il doit donc tenir deux exigences a la fois.
 *
 * Etre lisible par une personne : des colonnes nommees, ce qui est
 * obligatoire signale, des valeurs proposees plutot que devinees.
 *
 * Etre lisible par la plateforme sans la moindre ambiguite. L'import
 * reconnait les colonnes par leur intitule, cherche la ligne d'en-tete dans
 * les six premieres lignes, et ne lit que le premier onglet. Trois
 * contraintes qui gouvernent tout ce qui suit :
 *
 *  - l'en-tete est en ligne 1. Pas de banniere, pas de titre au-dessus :
 *    un decor de quatre lignes laisserait deux lignes de marge a la detection,
 *    et un fichier ou quelqu'un aurait insere une ligne deviendrait illisible.
 *    Ce qu'il y a a expliquer va dans le second onglet, que l'import ignore.
 *
 *  - les intitules sont ecrits exactement comme l'import les attend. Les
 *    embellir — « Nom * », « Activite (ignore) » — casserait la
 *    reconnaissance ou ferait passer la colonne pour inconnue. Ce qui est
 *    obligatoire se dit par la couleur et par le second onglet.
 *
 *  - aucune ligne d'exemple dans la grille. L'ancien modele en portait une :
 *    « Diallo / Aminata / aminata@example.com ». Qui remplit le fichier en
 *    dessous sans l'effacer importe Aminata Diallo comme une vraie
 *    beneficiaire. Les exemples sont dans le second onglet, ou rien ne peut
 *    etre importe.
 */

/* Les intitules attendus par l'import. Ils ne se modifient pas ici sans
   modifier FIELD_ALIASES dans import.routes.js — et l'inverse est vrai. */
const COLONNES = [
  { titre: "Nom",           largeur: 20, requis: true,
    aide: "Nom de famille. Obligatoire." },
  { titre: "Prenom",        largeur: 20, requis: true,
    aide: "Prénom. Obligatoire." },
  { titre: "Genre",         largeur: 10,
    aide: "H ou F.", liste: ["H", "F"] },
  { titre: "Tranche_age",   largeur: 14,
    aide: "Une tranche, pas un âge.",
    liste: ["6-12", "13-17", "18-25", "26-35", "36-45", "46-60", "60+"] },
  { titre: "Email",         largeur: 30,
    aide: "Une adresse par personne." },
  { titre: "Telephone",     largeur: 18, format: "@",
    aide: "Le numéro de la personne." },
  { titre: "Statut",        largeur: 20,
    aide: "Situation de la personne.",
    liste: ["Élève", "Étudiant", "Demandeur d'emploi", "Entrepreneur",
            "Salarié", "Fonctionnaire", "Sans emploi", "Autre"] },
  { titre: "Structure",     largeur: 32,
    aide: "École, université, entreprise ou organisation." },
  /* Ces deux-la ne sont pas lues : l'activite et sa date viennent du
     formulaire. On les garde pour que les fichiers deja remplis continuent de
     passer, mais elles sont grisees et placees en dernier — les faire remplir
     en premier pour les jeter etait le contraire d'un service. */
  { titre: "Activite",      largeur: 28, ignoree: true,
    aide: "Ignorée : l'activité vient du formulaire." },
  { titre: "Date_activite", largeur: 16, ignoree: true, format: "yyyy-mm-dd",
    aide: "Ignorée : la date vient du formulaire." },
];

/* Les couleurs d'Orange, ecrites comme Excel les veut : ARGB, alpha d'abord. */
const ORANGE = "FFFF7900";
const ORANGE_PALE = "FFFFF1E3";
const BLANC = "FFFFFFFF";
const ARDOISE = "FF1E293B";
const GRIS = "FF94A3B8";
const GRIS_PALE = "FFF1F5F9";
const BORDURE = "FFE2E8F0";

/* Assez de lignes pour une grande activite, pas assez pour alourdir le
   fichier. Au-dela, les lignes ajoutees heritent du format de la derniere. */
const LIGNES_PREPAREES = 300;

const traitFin = { style: "thin", color: { argb: BORDURE } };

function ongletSaisie(wb) {
  const ws = wb.addWorksheet("Liste de presences", {
    views: [{ state: "frozen", ySplit: 1, activeCell: "A2" }],
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = COLONNES.map((c) => ({
    key: c.titre,
    width: c.largeur,
    style: c.format ? { numFmt: c.format } : undefined,
  }));

  const entete = ws.getRow(1);
  entete.height = 30;
  COLONNES.forEach((c, i) => {
    const cell = entete.getCell(i + 1);
    /* L'intitule, exactement comme l'import l'attend. */
    cell.value = c.titre;
    cell.font = { bold: true, size: 11, color: { argb: c.ignoree ? GRIS : BLANC } };
    cell.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: c.ignoree ? GRIS_PALE : ORANGE },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: ORANGE } },
      bottom: { style: "medium", color: { argb: ARDOISE } },
      left: { style: "thin", color: { argb: BLANC } },
      right: { style: "thin", color: { argb: BLANC } },
    };
    /* Le mode d'emploi au survol : la personne qui remplit n'a pas a changer
       d'onglet pour savoir ce qu'on attend d'une colonne. */
    cell.note = c.requis ? `${c.aide}\nColonne obligatoire.` : c.aide;
  });

  /* Le filtre d'Excel sur l'en-tete : trier par structure ou par genre pour
     verifier une liste avant de l'envoyer. */
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLONNES.length } };

  /* Des lignes vides, mais deja mises en forme : on voit ou ecrire, et le
     numero de telephone garde ses zeros parce que la colonne est en texte.
     Aucune valeur : rien de ce modele ne doit pouvoir etre importe. */
  for (let r = 2; r <= LIGNES_PREPAREES + 1; r++) {
    const ligne = ws.getRow(r);
    ligne.height = 18;
    COLONNES.forEach((c, i) => {
      const cell = ligne.getCell(i + 1);
      cell.border = { top: traitFin, bottom: traitFin, left: traitFin, right: traitFin };
      cell.alignment = { vertical: "middle" };
      if (c.format) cell.numFmt = c.format;
      /* Une ligne sur deux en creux : sur deux cents lignes remplies a la
         main, c'est ce qui evite de sauter d'une ligne a l'autre. */
      if (r % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE_PALE } };
      }
      if (c.ignoree) {
        /* Gris uni sur toute la hauteur, sans alternance : la colonne doit se
           lire comme eteinte, pas comme une colonne a remplir. */
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_PALE } };
        cell.font = { color: { argb: GRIS }, italic: true };
      }
      if (c.requis) {
        cell.font = { bold: true, color: { argb: ARDOISE } };
      }
      /* Les valeurs proposees, jamais imposees : une liste qui refuse une
         saisie legitime fait recopier la colonne ailleurs, et on perd tout.
         La plateforme sait lire « Homme », « Etudiante », « 18 a 25 ans ». */
      if (c.liste) {
        cell.dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${c.liste.join(",")}"`],
          showErrorMessage: false,
        };
      }
    });
  }

  ws.getColumn(1).width = COLONNES[0].largeur;
  return ws;
}

function ongletModeEmploi(wb) {
  const ws = wb.addWorksheet("Mode d'emploi", {
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = [{ width: 22 }, { width: 58 }, { width: 34 }];

  const titre = ws.addRow(["Liste de présence — mode d'emploi"]);
  titre.height = 34;
  titre.getCell(1).font = { bold: true, size: 16, color: { argb: ARDOISE } };
  ws.mergeCells(titre.number, 1, titre.number, 3);

  const sous = ws.addRow([
    "Remplissez l'onglet « Liste de presences », une personne par ligne, puis envoyez le fichier tel quel.",
  ]);
  sous.getCell(1).font = { size: 11, color: { argb: "FF475569" } };
  ws.mergeCells(sous.number, 1, sous.number, 3);
  ws.addRow([]);

  const enTete = ws.addRow(["Colonne", "Ce qu'on attend", "Exemple"]);
  enTete.height = 24;
  for (let i = 1; i <= 3; i++) {
    const cell = enTete.getCell(i);
    cell.font = { bold: true, color: { argb: BLANC } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANGE } };
    cell.alignment = { vertical: "middle" };
  }

  /* Les exemples vivent ici, et nulle part ailleurs. Dans la grille de saisie
     ils finiraient importes comme de vrais beneficiaires. */
  const EXEMPLES = {
    Nom: "Diallo",
    Prenom: "Aminata",
    Genre: "F",
    Tranche_age: "18-25",
    Email: "aminata.diallo@example.sn",
    Telephone: "77 123 45 67",
    Statut: "Étudiant",
    Structure: "Université Cheikh Anta Diop",
    Activite: "—",
    Date_activite: "—",
  };

  for (const c of COLONNES) {
    const r = ws.addRow([c.titre, c.aide, EXEMPLES[c.titre]]);
    r.getCell(1).font = {
      bold: !!c.requis,
      color: { argb: c.ignoree ? GRIS : ARDOISE },
    };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    r.getCell(3).font = { color: { argb: "FF64748B" }, italic: true };
    if (c.requis) {
      r.getCell(1).fill = {
        type: "pattern", pattern: "solid", fgColor: { argb: ORANGE_PALE },
      };
    }
    for (let i = 1; i <= 3; i++) {
      r.getCell(i).border = { bottom: traitFin };
    }
  }

  ws.addRow([]);
  const t2 = ws.addRow(["Ce qui fait échouer un import"]);
  t2.getCell(1).font = { bold: true, size: 13, color: { argb: ARDOISE } };
  ws.mergeCells(t2.number, 1, t2.number, 3);

  /* Chacune de ces lignes correspond a une panne qu'on a vue arriver. */
  const PIEGES = [
    ["Renommer les colonnes",
     "La plateforme reconnaît « Prénom », « Prenoms », « First name »… mais pas « Colonne 3 ». Laissez la ligne 1 telle quelle."],
    ["Ajouter un titre au-dessus",
     "La ligne des intitulés doit rester la première. N'insérez pas de ligne au-dessus."],
    ["Un nom et un prénom dans la même case",
     "Utilisez les deux colonnes. Si vous n'avez qu'une case, nommez-la « Nom complet » : la plateforme saura la couper."],
    ["Plusieurs personnes sur une ligne",
     "Une ligne = une personne. Deux noms dans une case comptent pour une seule."],
    ["Le même numéro pour tout un groupe",
     "Fréquent pour les enfants : on porte le numéro du directeur d'école. C'est permis — la plateforme ne confond plus les personnes qui partagent un contact."],
    ["Laisser des lignes d'exemple",
     "Ce modèle n'en contient aucune, justement : tout ce que vous écrivez sera importé."],
  ];
  for (const [quoi, pourquoi] of PIEGES) {
    const r = ws.addRow([quoi, pourquoi]);
    r.getCell(1).font = { bold: true, color: { argb: ARDOISE } };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(r.number, 2, r.number, 3);
    r.height = 30;
  }

  ws.addRow([]);
  const pied = ws.addRow([
    "Une colonne en plus ne gêne pas : la plateforme l'ignore et vous le dit avant d'importer.",
  ]);
  pied.getCell(1).font = { italic: true, color: { argb: "FF64748B" } };
  ws.mergeCells(pied.number, 1, pied.number, 3);

  return ws;
}

/**
 * @returns {Promise<Buffer>} le classeur, pret a etre envoye.
 */
async function construireModeleListePresence() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Inside ODC";
  wb.created = new Date();

  /* L'ordre compte : l'import ne lit que le premier onglet. Le mode d'emploi
     doit donc venir apres, sinon la plateforme essaierait de l'importer. */
  ongletSaisie(wb);
  ongletModeEmploi(wb);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { construireModeleListePresence, COLONNES };
