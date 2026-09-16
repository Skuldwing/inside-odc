const express = require("express");
const pool = require("../db");
const { logAudit } = require("../services/audit");
const { computeAndStoreReliability } = require("../services/reliability");
const { clePersonne, memePersonne, normaliser } = require("../services/nomsDoublons");
const { trierAdresses } = require("../services/adressesValides");

const router = express.Router();

function isFormOpen(activityDate, dateFin) {
  const deadline = new Date(dateFin || activityDate);
  deadline.setUTCHours(23, 59, 59, 999);
  return new Date() <= deadline;
}

/* ── GET /checkin/:activityId — info publique sur l'activite ── */
router.get("/:activityId", async (req, res) => {
  try {
    const { activityId } = req.params;
    const result = await pool.query(
      `SELECT a.id, a.title, a.description, a.activity_date, a.date_fin, a.location,
              p.name AS partner_name, d.name AS device_name,
              COALESCE(ap.cnt, 0)::int AS participants_count
       FROM activities a
       LEFT JOIN partners p ON p.id = a.partner_id
       LEFT JOIN devices d ON d.id = a.device_id
       LEFT JOIN (SELECT activity_id, COUNT(*)::int AS cnt FROM activity_participants GROUP BY activity_id) ap
              ON ap.activity_id = a.id
       WHERE a.id = $1`,
      [activityId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Activite introuvable" });
    }
    const activity = result.rows[0];
    activity.is_open = isFormOpen(activity.activity_date, activity.date_fin);
    res.json(activity);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ── POST /checkin/:activityId — enregistrement presence ──
 *
 * Le formulaire ouvert par lien ou QR code est la seule source ou le
 * beneficiaire saisit lui-meme ses informations. C'est donc la plus fiable, et
 * c'etait la plus mal exploitee : le serveur ne retenait que le nom, le prenom
 * et le telephone, et surtout, des qu'il reconnaissait quelqu'un, il jetait
 * tout ce que le formulaire apportait. Une personne connue par son seul numero
 * pouvait remplir son adresse, son genre et sa tranche d'age a chaque
 * activite : sa fiche restait vide.
 */

/* Ce que le formulaire peut completer sur une fiche deja connue. Liste fermee,
   ecrite ici : aucune donnee recue n'entre dans le texte d'une requete. */
const CHAMPS_FICHE = ["email", "telephone", "genre", "structure", "age_range"];

const TRANCHES_AGE = [
  "Moins de 18 ans", "18-25 ans", "26-35 ans", "36-45 ans", "Plus de 45 ans",
];
const GENRES = ["F", "H", "Autre"];

const propre = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

router.post("/:activityId", async (req, res) => {
  const client = await pool.connect();
  try {
    const { activityId } = req.params;
    const corps = req.body || {};

    const nom = propre(corps.nom);
    const prenom = propre(corps.prenom);
    const telephone = propre(corps.telephone);
    const email = propre(corps.email)?.toLowerCase() || null;
    const genre = propre(corps.genre);
    const trancheAge = propre(corps.tranche_age);
    const structure = propre(corps.structure);

    if (!nom || !prenom) return res.status(400).json({ error: "Nom et prénom requis." });
    if (!telephone) return res.status(400).json({ error: "Numéro de téléphone requis." });

    /* Ces trois-la sont desormais exiges : l'adresse pour recevoir attestation
       et informations, le genre et la tranche d'age parce que le centre rend
       compte de qui il touche. Les demander au moment ou la personne est
       devant nous coute une seconde ; les reconstituer apres coup est
       impossible. */
    if (!email) return res.status(400).json({ error: "Adresse email requise." });
    if (!genre || !GENRES.includes(genre)) return res.status(400).json({ error: "Genre requis." });
    if (!trancheAge || !TRANCHES_AGE.includes(trancheAge)) {
      return res.status(400).json({ error: "Tranche d'âge requise." });
    }

    /* Une adresse mal saisie n'est pas rattrapable plus tard : la personne est
       partie. On la controle tant qu'elle est devant l'ecran et peut corriger. */
    const { rejetes } = await trierAdresses([{ email, nom: `${prenom} ${nom}` }]);
    if (rejetes.length) {
      return res.status(400).json({
        error: `Cette adresse ne peut pas recevoir de courrier : ${rejetes[0].explication}. Vérifiez-la.`,
        champ: "email",
      });
    }

    const actRes = await client.query(
      "SELECT id, title, activity_date, date_fin FROM activities WHERE id = $1",
      [activityId]
    );
    if (!actRes.rows.length) return res.status(404).json({ error: "Activité introuvable" });

    if (!isFormOpen(actRes.rows[0].activity_date, actRes.rows[0].date_fin)) {
      return res.status(403).json({ error: "La période d'inscription est clôturée.", closed: true });
    }

    await client.query("BEGIN");

    /* Reconnaitre la personne.
       L'adresse prime : elle est saisie par l'interesse lui-meme, a la
       premiere personne, et elle n'appartient qu'a lui. Le nom, en revanche,
       s'ecrit de dix facons — s'en servir pour contredire l'adresse
       refuserait l'inscription a quelqu'un qui aurait simplement ajoute son
       deuxieme prenom.
       Le telephone, lui, se partage — un numero de famille, celui d'un
       encadrant — et se saisit de travers : on ne s'y fie que si le nom
       concorde. */
    let fiche = null;
    const parEmail = await client.query(
      `SELECT id, nom, prenom, email, telephone, genre, structure, age_range
         FROM participants WHERE lower(email) = $1 LIMIT 1`,
      [email]
    );
    if (parEmail.rows.length) fiche = parEmail.rows[0];

    if (!fiche) {
      const parTel = await client.query(
        `SELECT id, nom, prenom, email, telephone, genre, structure, age_range
           FROM participants WHERE telephone = $1 LIMIT 1`,
        [telephone]
      );
      if (parTel.rows.length && memePersonne(parTel.rows[0], { nom, prenom })) {
        fiche = parTel.rows[0];
      }
    }

    /* Ni adresse ni numero connus : la personne a peut-etre ete inscrite par
       une liste de presence qui ne portait que son nom. On la rattache si ce
       nom ne designe qu'une seule fiche, et si rien de ce qu'elle saisit ne
       contredit ce qui y figure. */
    if (!fiche) {
      const cle = clePersonne(nom, prenom);
      if (cle) {
        const parNom = await client.query(
          `SELECT id, nom, prenom, email, telephone, genre, structure, age_range
             FROM participants WHERE lower(trim(nom)) = $1`,
          [normaliser(nom)]
        );
        const candidats = parNom.rows.filter((f) => clePersonne(f.nom, f.prenom) === cle);
        if (candidats.length === 1) {
          const c = candidats[0];
          const contredit =
            (c.email && c.email.toLowerCase() !== email) ||
            (c.telephone && c.telephone.trim() !== telephone);
          if (!contredit) fiche = c;
        }
      }
    }

    let participantId;
    let champsCompletes = 0;

    if (fiche) {
      participantId = fiche.id;

      /* Tout ce que le formulaire apporte et qui manque a la fiche. C'est le
         coeur de la correction : la saisie du beneficiaire ne se perd plus. */
      const apport = {
        email: fiche.email ? null : email,
        telephone: fiche.telephone ? null : telephone,
        genre: fiche.genre ? null : genre,
        structure: fiche.structure ? null : structure,
        age_range: fiche.age_range ? null : trancheAge,
      };

      /* Un contact deja porte par quelqu'un d'autre ne peut pas etre repris :
         l'index d'unicite le refuserait, et le prendre reviendrait a le retirer
         a son titulaire. */
      if (apport.telephone) {
        const pris = await client.query(
          "SELECT 1 FROM participants WHERE telephone = $1 AND id <> $2 LIMIT 1",
          [apport.telephone, participantId]
        );
        if (pris.rows.length) apport.telephone = null;
      }

      const colonnes = CHAMPS_FICHE.filter((c) => apport[c]);
      if (colonnes.length) {
        const affectations = colonnes.map((c, i) => `${c} = COALESCE(${c}, $${i + 2})`).join(", ");
        await client.query(
          `UPDATE participants SET ${affectations} WHERE id = $1`,
          [participantId, ...colonnes.map((c) => apport[c])]
        );
        champsCompletes = colonnes.length;
      }
    } else {
      /* Nouvelle fiche. Le numero peut appartenir a quelqu'un d'autre — un
         telephone de famille, celui d'un encadrant qui inscrit plusieurs
         personnes : on cree alors la fiche sans lui plutot que d'echouer.
         L'adresse, elle, est unique et vient d'etre verifiee libre. */
      const telPris = await client.query(
        "SELECT 1 FROM participants WHERE telephone = $1 LIMIT 1",
        [telephone]
      );
      const ins = await client.query(
        `INSERT INTO participants (nom, prenom, telephone, email, genre, structure, age_range, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Participant')
         RETURNING id`,
        [nom, prenom, telPris.rows.length ? null : telephone, email, genre, structure, trancheAge]
      );
      participantId = ins.rows[0].id;
    }

    const already = await client.query(
      "SELECT 1 FROM activity_participants WHERE activity_id = $1 AND participant_id = $2",
      [activityId, participantId]
    );
    if (already.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Présence déjà enregistrée pour cette activité.",
        already: true,
      });
    }

    await client.query(
      "INSERT INTO activity_participants (activity_id, participant_id) VALUES ($1, $2)",
      [activityId, participantId]
    );

    await client.query("COMMIT");

    logAudit(req, "CHECKIN", "activities", activityId, actRes.rows[0].title, {
      participant_id: participantId,
      via: "checkin_public",
      fiche_existante: Boolean(fiche),
      champs_completes: champsCompletes,
    });
    await computeAndStoreReliability(activityId).catch((e) => console.warn("Reliability:", e.message));

    res.json({
      ok: true,
      message: "Présence enregistrée avec succès !",
      activity: actRes.rows[0].title,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

module.exports = router;
