const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const { sendEmail, fournisseurRetenu } = require("../services/mail");
const { trierAdresses } = require("../services/adressesValides");
const { interpreterErreurEnvoi } = require("../services/deliverability");
const { classerParAssiduite } = require("../services/assiduite");
const { attestationPourActivite, moduleRetenu } = require("../services/attestationActivite");
const { getTemplate, renderTemplate } = require("./emailTemplates.routes");
const { ensureAttestationsEnvoyees } = require("../migrations/attestationsEnvoyees");

const router = express.Router();

/**
 * Attestations, personne par personne.
 *
 * L'envoi par activite sert la logistique : la seance est finie, tout le monde
 * recoit son document. Il a un defaut qu'on ne voit jamais depuis une activite,
 * parce qu'il ne s'y manifeste pas : quelqu'un qui suit deux fois la meme
 * formation — « Bureautique avancee » un vendredi, puis quinze jours plus tard
 * — recoit deux fois la meme attestation, a deux dates. Chaque activite, prise
 * seule, a raison ; c'est l'ensemble qui est faux.
 *
 * Vu par personne, la repetition saute aux yeux : ses modules sont sur un seul
 * ecran. On choisit ce qu'elle recoit, et tout part dans un seul message
 * plutot qu'en une rafale.
 *
 * Le rapprochement des fiches est celui de l'assiduite : adresse, telephone,
 * nom — avec la meme prudence sur les homonymes.
 */

/* Le perimetre de l'utilisateur, comme ailleurs : un partenaire ne voit que
   les beneficiaires de ses propres activites, un coach que les siens. */
function perimetre(req) {
  const conditions = [];
  const params = [];
  if (req.user.role === "partner") {
    conditions.push(`a.partner_id = $${params.length + 1}`);
    params.push(req.user.partner_id);
  } else if (req.user.role === "coach") {
    conditions.push(`a.coach_id = $${params.length + 1}`);
    params.push(req.user.id);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

/* Deux seances portant le meme intitule sont le meme module suivi deux fois.
   On compare sans casse ni accents : « Bureautique avancee » et « BUREAUTIQUE
   AVANCÉE » ne doivent pas passer pour deux formations differentes. */
const cleTitre = (t) =>
  String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

async function etatDesPersonnes(req) {
  const { where, params } = perimetre(req);
  const lignes = await pool.query(
    `SELECT p.id, p.nom, p.prenom, p.email, p.telephone, p.genre, p.structure,
            a.id AS activity_id, a.title AS titre,
            to_char(a.activity_date, 'YYYY-MM-DD') AS date,
            d.name AS dispositif
       FROM participants p
       JOIN activity_participants ap ON ap.participant_id = p.id
       JOIN activities a ON a.id = ap.activity_id
       LEFT JOIN devices d ON d.id = a.device_id
       ${where}
       ORDER BY p.id`,
    params
  );

  /* Ce qui est deja parti. Le couple (activite, fiche) est la cle de l'envoi :
     c'est celle qu'ecrit l'envoi par activite, et les deux vues doivent lire
     la meme chose. */
  let envoyees = { rows: [] };
  try {
    envoyees = await pool.query(
      "SELECT activity_id, participant_id, email, module, envoye_le FROM attestations_envoyees"
    );
  } catch (err) {
    if (err?.code !== "42P01") throw err;
    await ensureAttestationsEnvoyees();
  }
  const deja = new Map(
    envoyees.rows.map((r) => [`${r.activity_id}:${r.participant_id}`, r])
  );

  const personnes = classerParAssiduite(lignes.rows).map((x) => {
    /* Combien de seances portent chaque intitule. Au-dela d'une, c'est la
       repetition que l'envoi par activite ne montrait pas. */
    const parTitre = new Map();
    for (const m of x.modules) {
      const c = cleTitre(m.titre);
      parTitre.set(c, (parTitre.get(c) || 0) + 1);
    }

    /* Les seances les plus recentes d'abord : quand un intitule revient, c'est
       la derniere que l'on propose, celle dont la date est la plus juste. */
    const vus = new Set();
    const modules = x.modules.map((m) => {
      const c = cleTitre(m.titre);
      const premiereDuTitre = !vus.has(c);
      vus.add(c);
      const trace = deja.get(`${m.id}:${m.fiche_id}`) || null;
      return {
        ...m,
        deja_envoyee: Boolean(trace),
        envoyee_le: trace?.envoye_le || null,
        envoyee_a: trace?.email || null,
        /* Un meme intitule suivi plusieurs fois. */
        repete: (parTitre.get(c) || 0) > 1,
        /* Proposee a l'envoi : jamais recue, et pas deja couverte par une
           seance plus recente du meme intitule. C'est ce reglage par defaut
           qui empeche le double envoi, sans interdire de le forcer. */
        suggere: !trace && premiereDuTitre,
      };
    });

    /* Toutes les adresses connues de la personne : ses fiches peuvent en
       porter plusieurs, et c'est a l'utilisateur de dire laquelle sert. */
    const adresses = [...new Set(
      lignes.rows
        .filter((l) => x.fiches.includes(l.id) && l.email)
        .map((l) => String(l.email).trim())
    )];

    return {
      ...x,
      modules,
      adresses,
      modules_a_envoyer: modules.filter((m) => m.suggere).length,
      modules_recus: modules.filter((m) => m.deja_envoyee).length,
      titres_repetes: [...parTitre.values()].filter((n) => n > 1).length,
    };
  });

  return personnes;
}

/* ===== LA LISTE ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });
    const personnes = await etatDesPersonnes(req);
    res.json({
      personnes: personnes.length,
      a_servir: personnes.filter((p) => p.modules_a_envoyer > 0 && p.adresses.length).length,
      sans_adresse: personnes.filter((p) => !p.adresses.length).length,
      /* Le chiffre qui justifie cet ecran : combien de personnes ont suivi
         deux fois le meme intitule. */
      avec_repetition: personnes.filter((p) => p.titres_repetes > 0).length,
      liste: personnes,
    });
  } catch (err) {
    console.error("[ATTESTATIONS PAR PERSONNE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== L'ENVOI =====
   Un seul message, autant de pieces jointes que de modules choisis. Recevoir
   quatre messages coup sur coup ressemble a du publipostage et finit dans les
   indesirables ; un message avec quatre documents ressemble a ce que c'est. */
router.post("/envoyer", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const email = String(req.body?.email || "").trim().toLowerCase();
    const demandes = Array.isArray(req.body?.modules) ? req.body.modules : [];
    if (!email) return res.status(400).json({ error: "Adresse du destinataire requise." });
    if (!demandes.length) return res.status(400).json({ error: "Aucune attestation sélectionnée." });
    if (demandes.length > 20) {
      return res.status(400).json({ error: "Vingt attestations au maximum par message." });
    }

    if (fournisseurRetenu() === "aucun") {
      return res.status(503).json({ error: "Aucun service d'envoi configuré." });
    }

    /* On ne fait pas confiance a la liste recue : chaque couple est reverifie
       dans le perimetre de l'utilisateur. Sans ce controle, un coach pourrait
       demander l'attestation d'une activite qui ne le regarde pas. */
    const { where, params } = perimetre(req);
    const couples = demandes
      .map((m) => ({ activity_id: Number(m.activity_id), participant_id: Number(m.participant_id) }))
      .filter((m) => Number.isInteger(m.activity_id) && Number.isInteger(m.participant_id));
    if (!couples.length) return res.status(400).json({ error: "Sélection illisible." });

    const idx = params.length;
    const autorisees = await pool.query(
      `SELECT a.id AS activity_id, a.title, a.activity_date, a.location,
              a.device_id, a.partner_id, a.coach_id,
              p.id AS participant_id, p.nom, p.prenom,
              pa.name AS partner_name, d.name AS device_name, u.full_name AS coach_name
         FROM activity_participants ap
         JOIN activities a ON a.id = ap.activity_id
         JOIN participants p ON p.id = ap.participant_id
         LEFT JOIN partners pa ON pa.id = a.partner_id
         LEFT JOIN devices  d  ON d.id  = a.device_id
         LEFT JOIN users    u  ON u.id  = a.coach_id
         ${where}
         ${where ? "AND" : "WHERE"} (a.id, p.id) IN (
           SELECT * FROM unnest($${idx + 1}::int[], $${idx + 2}::int[])
         )`,
      [...params, couples.map((c) => c.activity_id), couples.map((c) => c.participant_id)]
    );

    if (!autorisees.rows.length) {
      return res.status(404).json({ error: "Aucune de ces inscriptions n'est accessible." });
    }

    const nomComplet =
      [autorisees.rows[0].prenom, autorisees.rows[0].nom].filter(Boolean).join(" ") || email;

    /* Renvoyer une attestation deja partie reste possible — une adresse
       corrigee le demande — mais jamais par accident. Sans « forcer », on
       refuse et on dit lesquelles, plutot que d'expedier un doublon sur un
       double clic : c'est precisement ce que cet ecran existe pour eviter. */
    const dejaParties = await pool.query(
      `SELECT activity_id, participant_id, module, email, envoye_le
         FROM attestations_envoyees
        WHERE (activity_id, participant_id) IN (
          SELECT * FROM unnest($1::int[], $2::int[])
        )`,
      [couples.map((c) => c.activity_id), couples.map((c) => c.participant_id)]
    );
    if (dejaParties.rows.length && req.body?.forcer !== true) {
      return res.status(409).json({
        error: "Certaines de ces attestations sont déjà parties.",
        deja_envoyees: dejaParties.rows.map((r) => ({
          activity_id: r.activity_id,
          participant_id: r.participant_id,
          module: r.module,
          email: r.email,
          envoye_le: r.envoye_le,
        })),
      });
    }

    /* L'adresse est controlee avant de produire quoi que ce soit : inutile de
       fabriquer quatre PDF pour un domaine qui n'existe pas. */
    const { rejetes } = await trierAdresses([{ email, nom: nomComplet }]);
    if (rejetes.length) {
      return res.status(400).json({
        error: `Cette adresse ne peut pas recevoir de courrier : ${rejetes[0].explication}.`,
        champ: "email",
      });
    }

    const pieces = [];
    const utilises = new Set();
    for (const r of autorisees.rows) {
      const activity = {
        id: r.activity_id,
        title: r.title,
        activity_date: r.activity_date,
        location: r.location,
        device_id: r.device_id,
        partner_id: r.partner_id,
        coach_id: r.coach_id,
        partner_name: r.partner_name,
        device_name: r.device_name,
        coach_name: r.coach_name,
      };
      const intitule = moduleRetenu(activity, null);
      const pdf = await attestationPourActivite({
        participant: { nom: r.nom, prenom: r.prenom },
        activity,
        module: intitule,
      });

      /* Deux seances du meme intitule donnent deux fichiers homonymes, que la
         messagerie afficherait l'un sur l'autre. On date le second. */
      let base = `attestation_${intitule}`
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/gi, "_").toLowerCase().replace(/_+$/, "");
      if (utilises.has(base)) {
        const jour = r.activity_date ? new Date(r.activity_date).toISOString().slice(0, 10) : "";
        base = `${base}_${jour}`;
      }
      utilises.add(base);

      pieces.push({
        activity_id: r.activity_id,
        participant_id: r.participant_id,
        intitule,
        piece: { filename: `${base}.pdf`, content: pdf, contentType: "application/pdf" },
      });
    }

    const tpl = await getTemplate("attestation");
    const liste = pieces.map((p) => p.intitule);
    const vars = {
      nom: nomComplet,
      activite: liste.join(", "),
      date: new Date().toLocaleDateString("fr-FR"),
      partenaire: autorisees.rows[0].partner_name || autorisees.rows[0].coach_name || "",
      dispositif: autorisees.rows[0].device_name || "",
      duree: "",
    };

    try {
      await sendEmail({
        toEmail: email,
        toName: nomComplet,
        subject: renderTemplate(tpl.subject, vars),
        html: renderTemplate(tpl.body_html, vars),
        text:
          `Bonjour ${nomComplet},\n\n` +
          `Veuillez trouver ci-joint votre attestation de participation ` +
          `${pieces.length > 1 ? "aux formations suivantes" : "à la formation"} :\n` +
          liste.map((t) => `- ${t}`).join("\n") +
          `\n\n— ODC Sénégal`,
        attachments: pieces.map((p) => p.piece),
      });
    } catch (err) {
      console.error("[ATTESTATIONS PAR PERSONNE ENVOI]", err);
      const brut = [err?.message, err?.code, err?.response].filter(Boolean).join(" · ");
      return res.status(502).json({ success: false, ...interpreterErreurEnvoi(brut), brut: brut.slice(0, 600) });
    }

    /* Trace posee apres l'envoi, jamais avant : si l'expedition echoue, la
       personne doit rester a servir. La meme table que l'envoi par activite,
       pour que les deux vues disent la meme chose. */
    for (const p of pieces) {
      /* Sur un renvoi force, la trace est reecrite : l'adresse et la date
         doivent dire ou le document est parti la derniere fois. */
      await pool.query(
        `INSERT INTO attestations_envoyees (activity_id, participant_id, email, module)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (activity_id, participant_id)
         DO UPDATE SET email = EXCLUDED.email, module = EXCLUDED.module, envoye_le = NOW()`,
        [p.activity_id, p.participant_id, email, p.intitule]
      );
    }

    logAudit(req, "SEND", "attestations_envoyees", null, `${nomComplet} — ${email}`, {
      modules: liste,
      nombre: pieces.length,
    });

    res.json({ ok: true, destinataire: email, envoyees: pieces.length, modules: liste });
  } catch (err) {
    console.error("[ATTESTATIONS PAR PERSONNE ENVOI]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
