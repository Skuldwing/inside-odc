const express = require("express");
const multer = require("multer");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { logAudit } = require("../services/audit");
const { ensureModelesAttestation } = require("../migrations/modelesAttestation");
const { genererAttestation, styleRetenu, stylesDisponibles } = require("../services/attestationModele");
const {
  analyserFond, composerAttestation, valeursExemple,
  VARIABLES, POLICES, ALIGNEMENTS,
} = require("../services/attestationPdfModele");
const { sendEmail, fournisseurRetenu } = require("../services/mail");
const { trierAdresses } = require("../services/adressesValides");
const { interpreterErreurEnvoi } = require("../services/deliverability");
const { getTemplate, renderTemplate, phraseOrganisateur, blocDetails, lienSignalement, composerEmail } = require("./emailTemplates.routes");

const router = express.Router();

/* Le logo reste en memoire : il part en base, pas sur le disque, que
   l'hebergement efface a chaque redeploiement. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") cb(null, true);
    else cb(Object.assign(new Error("Logo au format PNG ou JPEG"), { status: 400 }));
  },
});

/* Un fichier refuse doit expliquer pourquoi.
 *
 * Multer leve son refus AVANT que la route ne s'execute : le « try » de la
 * route ne le voit jamais, l'erreur remonte au gestionnaire general d'Express,
 * et celui-ci repond une page HTML. L'ecran recevait donc « erreur » la ou le
 * message disait exactement quoi faire — « depuis PowerPoint : Fichier,
 * Exporter, PDF ». C'est la seule phrase qui compte dans ce refus.
 *
 * Quatre parametres : c'est ainsi qu'Express reconnait un gestionnaire
 * d'erreur, et il doit suivre immediatement le lecteur qu'il couvre. */
function refusDeFichier(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      error: "Fichier trop lourd. Allégez les images de la maquette, ou réexportez-la.",
    });
  }
  res.status(400).json({ error: err?.message || "Fichier refusé." });
}

/* La migration de demarrage n'est pas attendue : si elle n'est pas passee, la
   page renverrait une erreur serveur sans rien expliquer. On la rejoue une
   fois, comme pour les campagnes. */
let schemaRejoue = false;
const tableAbsente = (err) => err?.code === "42P01" || err?.code === "42703";
async function avecSchema(travail) {
  try {
    return await travail();
  } catch (err) {
    if (!tableAbsente(err) || schemaRejoue) throw err;
    schemaRejoue = true;
    console.warn("[MODELES ATTESTATION] schéma incomplet, migration rejouée :", err.message);
    await ensureModelesAttestation();
    return travail();
  }
}

/* Jamais le logo dans la liste : une image par modele dans chaque reponse JSON
   ferait grossir la page pour rien. Un booleen suffit a savoir qu'il existe. */
const CHAMPS = `
  id, nom, style, bandeau_avant, bandeau_apres, programme, organisation, mention,
  signataire_nom, signataire_fonction, par_defaut,
  (logo_partenaire IS NOT NULL) AS a_logo,
  /* La maquette non plus n'est jamais renvoyee dans la liste : un PDF par
     modele dans chaque reponse JSON pèserait plusieurs mega-octets. On dit
     seulement qu'elle existe, et ce qu'elle porte. */
  (fond_pdf IS NOT NULL) AS a_fond,
  fond_pdf_nom, fond_depose_le, couleur_fond, zones
`;

/* La maquette, acceptee uniquement en PDF.
   Dix mega-octets : un export PowerPoint avec photos de fond les atteint
   rarement, mais une maquette au scan les depasserait. */
const deposerFond = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(Object.assign(
      new Error("La maquette doit être un PDF. Depuis PowerPoint : Fichier, Exporter, PDF."),
      { status: 400 }
    ));
  },
});

const TEXTES = [
  "nom", "bandeau_avant", "bandeau_apres", "programme",
  "organisation", "mention", "signataire_nom", "signataire_fonction",
];
const LONGUEUR_MAX = 160;

/* Le bandeau s'ecrit en deux morceaux accoles — « TECH- » puis « KI ». Rogner
   leurs espaces collerait « TECH ACADEMY » en « TECHACADEMY » : ici l'espace
   de bord fait partie du texte. On se contente d'ecarter les retours a la
   ligne, qui n'ont aucun sens sur une ligne unique. */
const BORDS_CONSERVES = new Set(["bandeau_avant", "bandeau_apres"]);

function lireTextes(corps) {
  const valeurs = {};
  for (const champ of TEXTES) {
    if (corps[champ] === undefined) continue;
    const brut = String(corps[champ] ?? "").replace(/\s*[\r\n]+\s*/g, " ");
    const v = BORDS_CONSERVES.has(champ) ? brut : brut.trim();
    valeurs[champ] = v.trim() ? v.slice(0, LONGUEUR_MAX) : null;
  }
  /* Le dessin du document. Une valeur inconnue retombe sur le modele
     d'origine : la liste des maquettes est fermee, elle ne se dicte pas
     depuis le navigateur. */
  if (corps.style !== undefined) valeurs.style = styleRetenu(corps.style);
  return valeurs;
}

/* Les maquettes proposees au menu. Servie a part de la liste des modeles :
   c'est un catalogue fixe, pas une donnee du centre. */
router.get("/styles", authMiddleware, (_req, res) => res.json(stylesDisponibles()));

/* ===== LISTE =====
   Avec les dispositifs rattaches : c'est la question que l'on se pose devant
   la liste — « celui-ci sert a quoi ? ». */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const r = await avecSchema(() =>
      pool.query(`
        SELECT ${CHAMPS},
               COALESCE((
                 SELECT json_agg(json_build_object('id', d.id, 'name', d.name) ORDER BY d.name)
                   FROM devices d WHERE d.modele_attestation_id = modeles_attestation.id
               ), '[]'::json) AS dispositifs
          FROM modeles_attestation ORDER BY par_defaut DESC, nom
      `)
    );
    res.json(r.rows);
  } catch (err) {
    console.error("[MODELES ATTESTATION]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== CREATION ===== */
router.post("/", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const valeurs = lireTextes(req.body || {});
    if (!valeurs.nom) return res.status(400).json({ error: "Le nom du modèle est requis." });

    const colonnes = Object.keys(valeurs);
    const r = await avecSchema(() =>
      pool.query(
        `INSERT INTO modeles_attestation (${colonnes.join(", ")})
         VALUES (${colonnes.map((_, i) => `$${i + 1}`).join(", ")})
         RETURNING ${CHAMPS}`,
        colonnes.map((c) => valeurs[c])
      )
    );
    logAudit(req, "CREATE", "modeles_attestation", r.rows[0].id, r.rows[0].nom, {});
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[MODELES ATTESTATION CREATION]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MODIFICATION ===== */
router.patch("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const valeurs = lireTextes(req.body || {});
    if ("nom" in valeurs && !valeurs.nom) {
      return res.status(400).json({ error: "Le nom du modèle est requis." });
    }
    const colonnes = Object.keys(valeurs);
    if (!colonnes.length) return res.status(400).json({ error: "Rien à modifier." });

    const r = await avecSchema(() =>
      pool.query(
        `UPDATE modeles_attestation
            SET ${colonnes.map((c, i) => `${c} = $${i + 2}`).join(", ")}
          WHERE id = $1 RETURNING ${CHAMPS}`,
        [id, ...colonnes.map((c) => valeurs[c])]
      )
    );
    if (!r.rows.length) return res.status(404).json({ error: "Modèle introuvable" });
    logAudit(req, "UPDATE", "modeles_attestation", id, r.rows[0].nom, valeurs);
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[MODELES ATTESTATION MODIF]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== MODELE PAR DEFAUT =====
   Celui qui sert aux dispositifs qui n'en designent aucun. L'index d'unicite
   interdit qu'il y en ait deux : on retire l'ancien dans la meme transaction. */
router.post("/:id/par-defaut", authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    const id = Number(req.params.id);
    await client.query("BEGIN");
    ouverte = true;
    await client.query("UPDATE modeles_attestation SET par_defaut = FALSE WHERE par_defaut");
    const r = await client.query(
      `UPDATE modeles_attestation SET par_defaut = TRUE WHERE id = $1 RETURNING ${CHAMPS}`,
      [id]
    );
    if (!r.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Modèle introuvable" });
    }
    await client.query("COMMIT");
    ouverte = false;
    logAudit(req, "UPDATE", "modeles_attestation", id, r.rows[0].nom, { par_defaut: true });
    res.json(r.rows[0]);
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[MODELES ATTESTATION DEFAUT]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* ===== DISPOSITIFS RATTACHES =====
   Un dispositif n'a qu'un modele : rattacher ceux de la liste, detacher ceux
   qui n'y sont plus, dans la meme transaction pour qu'un echec au milieu ne
   laisse pas des dispositifs sans modele. */
router.put("/:id/dispositifs", authMiddleware, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    const id = Number(req.params.id);
    const ids = Array.isArray(req.body?.dispositifs)
      ? [...new Set(req.body.dispositifs.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
      : null;
    if (!ids) return res.status(400).json({ error: "Liste de dispositifs attendue." });

    const existe = await avecSchema(() =>
      client.query("SELECT nom FROM modeles_attestation WHERE id = $1", [id])
    );
    if (!existe.rows.length) return res.status(404).json({ error: "Modèle introuvable" });

    await client.query("BEGIN");
    ouverte = true;
    await client.query(
      "UPDATE devices SET modele_attestation_id = NULL WHERE modele_attestation_id = $1 AND NOT (id = ANY($2::int[]))",
      [id, ids]
    );
    if (ids.length) {
      await client.query(
        "UPDATE devices SET modele_attestation_id = $1 WHERE id = ANY($2::int[])",
        [id, ids]
      );
    }
    await client.query("COMMIT");
    ouverte = false;
    logAudit(req, "UPDATE", "modeles_attestation", id, existe.rows[0].nom, { dispositifs: ids });
    res.json({ ok: true, dispositifs: ids });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[MODELES ATTESTATION DISPOSITIFS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* ===== SUPPRESSION ===== */
router.delete("/:id", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actuel = await avecSchema(() =>
      pool.query("SELECT nom, par_defaut FROM modeles_attestation WHERE id = $1", [id])
    );
    if (!actuel.rows.length) return res.status(404).json({ error: "Modèle introuvable" });
    /* Supprimer le modele par defaut laisserait sans reference les dispositifs
       qui n'en designent aucun. On demande d'en designer un autre d'abord. */
    if (actuel.rows[0].par_defaut) {
      return res.status(400).json({
        error: "C'est le modèle par défaut. Désignez-en un autre avant de le supprimer.",
      });
    }
    await pool.query("DELETE FROM modeles_attestation WHERE id = $1", [id]);
    logAudit(req, "DELETE", "modeles_attestation", id, actuel.rows[0].nom, {});
    res.json({ ok: true });
  } catch (err) {
    console.error("[MODELES ATTESTATION SUPPR]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== LA MAQUETTE DE L'ÉQUIPE =====
 *
 * Déposer un PDF, y lire les lignes à remplir, et les retoucher.
 *
 * La lecture se fait une fois, au dépôt, et son résultat est enregistré. Elle
 * prend près d'une seconde sur un document chargé : la refaire à chaque
 * attestation ferait attendre un envoi de cent personnes près de deux minutes
 * pour rien, puisque la maquette ne change pas entre deux envois.
 */
router.post(
  "/:id/maquette",
  authMiddleware,
  requireAdmin,
  deposerFond.single("maquette"),
  refusDeFichier,
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Fichier requis" });
      const id = Number(req.params.id);

      let lecture;
      try {
        lecture = await analyserFond(req.file.buffer);
      } catch (err) {
        /* Un PDF protégé, corrompu, ou produit par un outil exotique. On le
           dit plutôt que de l'enregistrer et de laisser la panne pour le jour
           de l'envoi. */
        console.warn("[MAQUETTE] lecture impossible :", err.message);
        return res.status(400).json({
          error:
            "Ce PDF n'a pas pu être lu. S'il est protégé par mot de passe, enlevez la protection ; " +
            "sinon, réexportez-le depuis PowerPoint.",
        });
      }

      const r = await avecSchema(() =>
        pool.query(
          `UPDATE modeles_attestation
              SET fond_pdf = $2, fond_pdf_nom = $3, fond_depose_le = NOW(),
                  zones = $4::jsonb,
                  /* Déposer une maquette, c'est vouloir s'en servir. */
                  style = 'maquette'
            WHERE id = $1 RETURNING ${CHAMPS}`,
          [id, req.file.buffer, req.file.originalname.slice(0, 160), JSON.stringify(lecture.zones)]
        )
      );
      if (!r.rows.length) return res.status(404).json({ error: "Modèle introuvable" });

      logAudit(req, "UPDATE", "modeles_attestation", id, r.rows[0].nom, {
        motif: "maquette déposée",
        fichier: req.file.originalname,
        lignes_a_remplir: lecture.zones.length,
      });

      res.json({
        ...r.rows[0],
        pages: lecture.pages,
        /* Ce qui n'a pas été reconnu, pour que ce soit corrigé avant le
           premier envoi et non découvert par un bénéficiaire. */
        inconnus: lecture.inconnus,
        variables: VARIABLES,
      });
    } catch (err) {
      if (err?.status === 400) return res.status(400).json({ error: err.message });
      console.error("[MAQUETTE]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
);

/* Retoucher les réglages d'une ligne : police, couleur, alignement. La
   position et le gabarit viennent de la lecture du PDF et ne se modifient pas
   ici — les changer à la main désalignerait l'écriture de la maquette. */
router.put("/:id/maquette/zones", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const actuel = await avecSchema(() =>
      pool.query("SELECT zones FROM modeles_attestation WHERE id = $1", [id])
    );
    if (!actuel.rows.length) return res.status(404).json({ error: "Modèle introuvable" });

    const posees = Array.isArray(req.body?.zones) ? req.body.zones : [];
    const reglages = new Map(posees.map((z) => [z.id, z]));
    const fusionnees = (actuel.rows[0].zones || []).map((z) => {
      const neuf = reglages.get(z.id) || {};
      return {
        ...z,
        police: POLICES[neuf.police] ? neuf.police : z.police,
        alignement: ALIGNEMENTS.includes(neuf.alignement) ? neuf.alignement : z.alignement,
        couleur: /^#[0-9a-f]{6}$/i.test(String(neuf.couleur || "")) ? neuf.couleur : z.couleur,
      };
    });

    const couleurFond = /^#[0-9a-f]{6}$/i.test(String(req.body?.couleur_fond || ""))
      ? req.body.couleur_fond
      : undefined;

    const r = await avecSchema(() =>
      pool.query(
        `UPDATE modeles_attestation
            SET zones = $2::jsonb,
                couleur_fond = COALESCE($3, couleur_fond)
          WHERE id = $1 RETURNING ${CHAMPS}`,
        [id, JSON.stringify(fusionnees), couleurFond || null]
      )
    );
    oublierModeles();
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[MAQUETTE ZONES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id/maquette", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await avecSchema(() =>
      pool.query(
        `UPDATE modeles_attestation
            SET fond_pdf = NULL, fond_pdf_nom = NULL, fond_depose_le = NULL,
                zones = '[]'::jsonb,
                /* Sans maquette, le style « maquette » n'a plus de sens : on
                   revient au dessin d'origine plutôt que de laisser un modèle
                   qui échouerait au premier envoi. */
                style = 'tech-ki'
          WHERE id = $1 RETURNING ${CHAMPS}`,
        [id]
      )
    );
    if (!r.rows.length) return res.status(404).json({ error: "Modèle introuvable" });
    oublierModeles();
    logAudit(req, "UPDATE", "modeles_attestation", id, r.rows[0].nom, { motif: "maquette retirée" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[MAQUETTE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* L'aperçu : la maquette remplie de valeurs d'exemple.
   C'est lui qui rend visibles en deux secondes les deux défauts que la lecture
   ne peut pas deviner — un recouvrement qui se voit sur un fond non uni, et
   une police qui jure avec le reste du document. */
router.get("/:id/maquette/apercu", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await avecSchema(() =>
      pool.query(
        "SELECT nom, fond_pdf, zones, couleur_fond FROM modeles_attestation WHERE id = $1",
        [id]
      )
    );
    const m = r.rows[0];
    if (!m?.fond_pdf) return res.status(404).json({ error: "Aucune maquette déposée" });

    const pdf = await composerAttestation({
      fond: m.fond_pdf,
      zones: m.zones || [],
      valeurs: valeursExemple(),
      couleurFond: m.couleur_fond || "#FFFFFF",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="apercu-maquette.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error("[MAQUETTE APERCU]", err);
    res.status(500).json({ error: "La composition de l'aperçu a échoué." });
  }
});

/* ===== LOGO DU PARTENAIRE ===== */
/* Même garde que pour la maquette : sans elle, un fichier trop lourd ou d'un
   format refusé renvoyait une page HTML au lieu du motif. */
router.post("/:id/logo", authMiddleware, requireAdmin, upload.single("logo"), refusDeFichier,
  async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });
    const id = Number(req.params.id);
    const r = await avecSchema(() =>
      pool.query(
        `UPDATE modeles_attestation
            SET logo_partenaire = $2, logo_partenaire_type = $3
          WHERE id = $1 RETURNING ${CHAMPS}`,
        [id, req.file.buffer, req.file.mimetype]
      )
    );
    if (!r.rows.length) return res.status(404).json({ error: "Modèle introuvable" });
    logAudit(req, "UPDATE", "modeles_attestation", id, r.rows[0].nom, { logo: req.file.originalname });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[MODELES ATTESTATION LOGO]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.delete("/:id/logo", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await avecSchema(() =>
      pool.query(
        `UPDATE modeles_attestation
            SET logo_partenaire = NULL, logo_partenaire_type = NULL
          WHERE id = $1 RETURNING ${CHAMPS}`,
        [id]
      )
    );
    if (!r.rows.length) return res.status(404).json({ error: "Modèle introuvable" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[MODELES ATTESTATION LOGO SUPPR]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/:id/logo", authMiddleware, async (req, res) => {
  try {
    const r = await avecSchema(() =>
      pool.query(
        "SELECT logo_partenaire, logo_partenaire_type FROM modeles_attestation WHERE id = $1",
        [Number(req.params.id)]
      )
    );
    const ligne = r.rows[0];
    if (!ligne?.logo_partenaire) return res.status(404).json({ error: "Aucun logo" });
    res.setHeader("Content-Type", ligne.logo_partenaire_type || "image/png");
    res.setHeader("Cache-Control", "private, max-age=60");
    res.send(ligne.logo_partenaire);
  } catch (err) {
    console.error("[MODELES ATTESTATION LOGO LECTURE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== APERCU =====
   Regler un modele a l'aveugle et ne le decouvrir qu'a l'envoi serait un pari.
   L'apercu prend les valeurs en cours de saisie — pas celles enregistrees —
   pour qu'on voie ce qu'on ecrit ; le logo, lui, vient du modele enregistre,
   puisqu'un fichier ne se transporte pas dans un JSON. */
/* Le modele enregistre, logo compris. L'apercu prend en plus les valeurs en
   cours de saisie ; la generation ponctuelle, elle, s'en tient a ce qui est
   enregistre — on ne veut pas remettre un document compose a moitie. */
async function modeleEnregistre(id) {
  if (!Number.isInteger(id) || id <= 0) return {};
  const r = await avecSchema(() =>
    pool.query("SELECT * FROM modeles_attestation WHERE id = $1", [id])
  );
  return r.rows[0] || {};
}

const LONGUEUR_MODULE = 120;
const LONGUEUR_NOM = 120;

/* Ce que l'on ecrit sur un document ponctuel. Les memes bornes qu'ailleurs :
   au-dela, le rendu reduit la police jusqu'a l'illisible pour faire tenir le
   texte sur sa ligne. */
function lireDemande(corps) {
  const nom = String(corps.nom || "").trim().slice(0, LONGUEUR_NOM);
  const prenom = String(corps.prenom || "").trim().slice(0, LONGUEUR_NOM);
  const intitule = String(corps.module || "").trim().slice(0, LONGUEUR_MODULE);
  const lieu = String(corps.lieu || "").trim().slice(0, 60) || "Dakar";

  /* Une date absente vaut aujourd'hui ; une date illisible est refusee plutot
     que remplacee en silence — « Invalid Date » s'imprimerait tel quel. */
  let date = new Date();
  if (corps.date) {
    const d = new Date(corps.date);
    if (Number.isNaN(d.getTime())) return { erreur: "Date illisible." };
    date = d;
  }

  if (!nom && !prenom) return { erreur: "Le nom du bénéficiaire est requis." };
  if (!intitule) return { erreur: "L'intitulé du module est requis." };
  return { nom, prenom, intitule, date, lieu };
}

const nomFichier = (prenom, nom) =>
  `attestation_${[prenom, nom].filter(Boolean).join("_")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/gi, "_").toLowerCase() || "beneficiaire"}.pdf`;

router.post("/apercu", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const corps = req.body || {};
    const modele = lireTextes(corps);
    const id = Number(corps.modele_id);
    if (Number.isInteger(id) && id > 0) {
      const r = await avecSchema(() =>
        pool.query("SELECT logo_partenaire FROM modeles_attestation WHERE id = $1", [id])
      );
      if (r.rows[0]?.logo_partenaire) modele.logo_partenaire = r.rows[0].logo_partenaire;
    }
    const pdf = await genererAttestation({
      participant: { prenom: "Prénom", nom: "Nom du participant" },
      module: String(corps.module || "Initiation au numérique").slice(0, 120),
      date: new Date(),
      lieu: "Dakar",
      modele,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="apercu-modele.pdf"');
    /* Un apercu doit montrer la maquette du jour, jamais une copie gardee
       par le navigateur : c'est precisement ce qu'on vient y verifier. */
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (err) {
    console.error("[MODELES ATTESTATION APERCU]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ATTESTATION PONCTUELLE =====
   Toutes les attestations ne naissent pas d'une liste de presence. Un
   intervenant, un jury, quelqu'un dont la seance n'a pas ete saisie : il
   fallait jusqu'ici creer une activite fictive et l'y inscrire pour obtenir un
   document. On ecrit le nom, le module et la date, on choisit le modele, et on
   telecharge. */
router.post("/generer", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const corps = req.body || {};
    const d = lireDemande(corps);
    if (d.erreur) return res.status(400).json({ error: d.erreur });

    const modele = await modeleEnregistre(Number(corps.modele_id));
    const pdf = await genererAttestation({
      participant: { prenom: d.prenom, nom: d.nom },
      module: d.intitule,
      date: d.date,
      lieu: d.lieu,
      modele,
    });

    /* Un document nominatif remis a quelqu'un merite une trace : on ne saura
       pas autrement qui l'a etabli, ni pour qui. */
    logAudit(req, "CREATE", "attestation_ponctuelle", null, `${d.prenom} ${d.nom}`.trim(), {
      module: d.intitule,
      date: d.date.toISOString().slice(0, 10),
      modele: modele.nom || null,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${nomFichier(d.prenom, d.nom)}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    /* Document nominatif : il ne reste ni dans le navigateur ni dans un
       cache intermediaire. */
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (err) {
    console.error("[ATTESTATION PONCTUELLE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Le meme document, envoye depuis la plateforme. Telecharger puis joindre a la
   main reste possible — c'est meme le plus simple pour un seul destinataire —
   mais l'envoi d'ici porte la mise en page habituelle et l'adresse
   d'expedition authentifiee du centre. */
router.post("/envoyer", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const corps = req.body || {};
    const d = lireDemande(corps);
    if (d.erreur) return res.status(400).json({ error: d.erreur });

    const email = String(corps.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Adresse du destinataire requise." });

    if (fournisseurRetenu() === "aucun") {
      return res.status(503).json({
        error: "Aucun service d'envoi configuré.",
        remede: "Téléchargez le PDF et envoyez-le depuis votre messagerie.",
      });
    }

    /* Le meme controle qu'ailleurs : une adresse dont le domaine n'existe pas
       ne part pas. Le rebond n'apporterait rien et compte contre la
       reputation du compte d'expedition. */
    const nomComplet = [d.prenom, d.nom].filter(Boolean).join(" ");
    const { rejetes } = await trierAdresses([{ email, nom: nomComplet }]);
    if (rejetes.length) {
      return res.status(400).json({
        error: `Cette adresse ne peut pas recevoir de courrier : ${rejetes[0].explication}.`,
        champ: "email",
      });
    }

    const modele = await modeleEnregistre(Number(corps.modele_id));
    const pdf = await genererAttestation({
      participant: { prenom: d.prenom, nom: d.nom },
      module: d.intitule,
      date: d.date,
      lieu: d.lieu,
      modele,
    });

    const tpl = await getTemplate("attestation");
    const vars = {
      nom: nomComplet,
      activite: d.intitule,
      date: d.date.toLocaleDateString("fr-FR"),
      partenaire: modele.organisation || "",
      /* Cette route ne transmettait pas « organisateur » : la variable
         arrivait telle quelle chez le beneficiaire, « {{organisateur}} » en
         toutes lettres au milieu du message. */
      organisateur: phraseOrganisateur(modele.organisation),
      dispositif: modele.programme || "",
      duree: "",
    };
    vars.details = blocDetails(vars);
    vars.signalement = lienSignalement(vars);

    try {
      await sendEmail({
        toEmail: email,
        toName: nomComplet || email,
        subject: renderTemplate(tpl.subject, vars),
        html: composerEmail(tpl, vars),
        text: `Bonjour ${nomComplet},\n\nVeuillez trouver ci-joint votre attestation de participation à "${d.intitule}".\n\n— ODC Sénégal`,
        attachments: [
          { filename: nomFichier(d.prenom, d.nom), content: pdf, contentType: "application/pdf" },
        ],
      });
    } catch (err) {
      /* Dire pourquoi, et rappeler que le document existe : l'utilisateur peut
         le telecharger et l'envoyer lui-meme sans rien ressaisir. */
      console.error("[ATTESTATION PONCTUELLE ENVOI]", err);
      const brut = [err?.message, err?.code, err?.response].filter(Boolean).join(" · ");
      const lecture = interpreterErreurEnvoi(brut);
      return res.status(502).json({ success: false, ...lecture, brut: brut.slice(0, 600) });
    }

    logAudit(req, "SEND", "attestation_ponctuelle", null, `${nomComplet} — ${email}`, {
      module: d.intitule,
      date: d.date.toISOString().slice(0, 10),
      modele: modele.nom || null,
    });

    res.json({ ok: true, destinataire: email });
  } catch (err) {
    console.error("[ATTESTATION PONCTUELLE ENVOI]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * Le modele qui s'applique a une activite : celui de son dispositif, sinon
 * celui par defaut. Renvoie null si la table n'existe pas encore — le rendu
 * retombe alors sur ses valeurs d'origine.
 */
/* Le modèle retenu pour une activité, gardé quelques secondes.
 *
 * Un envoi groupé appelle cette fonction une fois par bénéficiaire, toujours
 * pour la même activité. Sans ce cache, une maquette de trois méga-octets
 * repartait de la base cent fois pour une séance de cent personnes : trois
 * cents méga-octets transférés, et autant d'attente, pour un document qui ne
 * change pas entre deux destinataires.
 *
 * Quelques secondes suffisent : elles couvrent un envoi groupé, et une
 * maquette modifiée pendant ce temps-là ne serait de toute façon pas celle
 * qu'on voulait appliquer à la moitié de la liste. */
const CACHE_MODELE_MS = 30_000;
const cacheModeles = new Map();

function cacheLire(cle) {
  const trouve = cacheModeles.get(cle);
  if (!trouve) return null;
  if (Date.now() > trouve.expire) {
    cacheModeles.delete(cle);
    return null;
  }
  return trouve.valeur;
}

function cacheEcrire(cle, valeur) {
  /* Le cache ne doit pas devenir un entrepôt : une plateforme avec cinquante
     dispositifs garderait cinquante PDF en mémoire. On le vide quand il
     grossit, le coût d'une relecture étant bien moindre que celui d'une fuite
     de mémoire. */
  if (cacheModeles.size > 12) cacheModeles.clear();
  cacheModeles.set(cle, { valeur, expire: Date.now() + CACHE_MODELE_MS });
}

/* Toute écriture sur un modèle le périme : sans cela, une maquette remplacée
   mettrait une demi-minute à être prise en compte, et personne ne
   comprendrait pourquoi l'aperçu et l'envoi ne montrent pas la même chose. */
function oublierModeles() {
  cacheModeles.clear();
}

async function modelePourActivite(activity) {
  const cle = `d${activity?.device_id || 0}`;
  const garde = cacheLire(cle);
  if (garde !== null) return garde;
  try {
    if (activity?.device_id) {
      const r = await pool.query(
        `SELECT m.* FROM modeles_attestation m
           JOIN devices d ON d.modele_attestation_id = m.id
          WHERE d.id = $1`,
        [activity.device_id]
      );
      if (r.rows.length) {
        cacheEcrire(cle, r.rows[0]);
        return r.rows[0];
      }
    }
    const d = await pool.query("SELECT * FROM modeles_attestation WHERE par_defaut LIMIT 1");
    const retenu = d.rows[0] || null;
    cacheEcrire(cle, retenu);
    return retenu;
  } catch (err) {
    if (tableAbsente(err)) return null;
    throw err;
  }
}

module.exports = router;
module.exports.modelePourActivite = modelePourActivite;
