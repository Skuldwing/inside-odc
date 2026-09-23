const express = require("express");
const multer = require("multer");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const { logAudit } = require("../services/audit");
const { ensureModelesAttestation } = require("../migrations/modelesAttestation");
const { genererAttestation, styleRetenu, stylesDisponibles } = require("../services/attestationModele");
const { sendEmail, fournisseurRetenu } = require("../services/mail");
const { trierAdresses } = require("../services/adressesValides");
const { interpreterErreurEnvoi } = require("../services/deliverability");
const { getTemplate, renderTemplate } = require("./emailTemplates.routes");

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
  (logo_partenaire IS NOT NULL) AS a_logo
`;

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

/* ===== LOGO DU PARTENAIRE ===== */
router.post("/:id/logo", authMiddleware, requireAdmin, upload.single("logo"), async (req, res) => {
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
      dispositif: modele.programme || "",
      duree: "",
    };

    try {
      await sendEmail({
        toEmail: email,
        toName: nomComplet || email,
        subject: renderTemplate(tpl.subject, vars),
        html: renderTemplate(tpl.body_html, vars),
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
async function modelePourActivite(activity) {
  try {
    if (activity?.device_id) {
      const r = await pool.query(
        `SELECT m.* FROM modeles_attestation m
           JOIN devices d ON d.modele_attestation_id = m.id
          WHERE d.id = $1`,
        [activity.device_id]
      );
      if (r.rows.length) return r.rows[0];
    }
    const d = await pool.query("SELECT * FROM modeles_attestation WHERE par_defaut LIMIT 1");
    return d.rows[0] || null;
  } catch (err) {
    if (tableAbsente(err)) return null;
    throw err;
  }
}

module.exports = router;
module.exports.modelePourActivite = modelePourActivite;
