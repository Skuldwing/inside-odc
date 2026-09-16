const pool = require("../db");
const { sendEmail } = require("./mail");
const { entetesDesabonnement, lienDesabonnement, separerDesabonnes, normaliser } = require("./desabonnement");
const { interpreterErreurEnvoi } = require("./deliverability");
const { trierAdresses } = require("./adressesValides");

/**
 * Envoi d'une campagne.
 *
 * L'envoi se faisait auparavant dans la requete HTTP elle-meme : on bouclait
 * sur les destinataires et on repondait a la fin. Sur quelques dizaines
 * d'adresses cela passait ; au-dela, le mandataire coupait la connexion avant
 * la fin, l'administrateur voyait une erreur alors que les messages partaient,
 * et la campagne restait figee en « en cours » — sans aucun moyen de savoir ou
 * l'envoi s'etait arrete.
 *
 * L'envoi est donc detache de la requete, trace destinataire par
 * destinataire, et cadence : Exchange Online coupe au-dela d'une trentaine de
 * messages par minute, et un envoi en rafale est de toute facon le meilleur
 * moyen de se faire prendre pour un expediteur indesirable.
 */

/* Un peu en dessous de la limite d'Exchange Online (~30/min), pour garder de
   la marge aux emails transactionnels qui partent en meme temps. */
const DEBIT_PAR_MINUTE = Math.max(1, Number(process.env.MAIL_DEBIT_PAR_MINUTE || 25));
const INTERVALLE_MS = Math.ceil(60000 / DEBIT_PAR_MINUTE);

/* Une campagne a la fois : deux envois simultanes de la meme campagne
   enverraient deux fois le meme message aux memes personnes. */
const enCours = new Set();

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* Le journal affichait le message brut du service d'envoi — « Brevo error
   401: {"message":"Key not found"} » repete sur chaque destinataire. Exact,
   mais illisible, et surtout muet sur la manoeuvre. On garde le message
   d'origine, precede de ce qu'il veut dire. */
function erreurLisible(err) {
  const brut = [err?.message, err?.code, err?.responseCode].filter(Boolean).join(" · ");
  const { cause } = interpreterErreurEnvoi(brut);
  return `${cause} — ${brut}`.slice(0, 500);
}

/* ===== DESTINATAIRES ===== */

/* Les colonnes lues ici ne sont pas celles que le code d'origine demandait.
   Il reclamait « participants.full_name » et « partners.email » : ni l'une ni
   l'autre n'existe — les participants portent « nom » et « prenom », les
   partenaires « contact_email ». Postgres repondait 42703, la route rendait un
   500 « Erreur lors de l'envoi », et aucune campagne adressee a des
   participants ou a des partenaires ne pouvait partir. Seul le mode « emails
   personnalises », qui ne touche pas la base, fonctionnait. */
async function resoudreDestinataires(camp) {
  const NOM_PARTICIPANT = `NULLIF(TRIM(CONCAT_WS(' ', p.prenom, p.nom)), '')`;

  if (camp.recipients_type === "all_participants") {
    const r = await pool.query(
      `SELECT p.email, ${NOM_PARTICIPANT} AS full_name
         FROM participants p
        WHERE p.email IS NOT NULL AND TRIM(p.email) != ''
        ORDER BY p.email`
    );
    return r.rows;
  }

  if (camp.recipients_type === "all_partners") {
    const r = await pool.query(
      `SELECT contact_email AS email, name AS full_name
         FROM partners
        WHERE contact_email IS NOT NULL AND TRIM(contact_email) != ''
        ORDER BY contact_email`
    );
    return r.rows;
  }

  if (camp.recipients_type === "by_activity" && camp.activity_id) {
    const r = await pool.query(
      `SELECT p.email, ${NOM_PARTICIPANT} AS full_name
         FROM participants p
         JOIN activity_participants ap ON ap.participant_id = p.id
        WHERE ap.activity_id = $1
          AND p.email IS NOT NULL AND TRIM(p.email) != ''`,
      [camp.activity_id]
    );
    return r.rows;
  }

  if (camp.recipients_type === "custom") {
    try {
      const emails = JSON.parse(camp.custom_emails || "[]");
      return emails
        .map((e) => ({ email: String(e).trim(), full_name: String(e).trim() }))
        .filter((r) => r.email.includes("@"));
    } catch {
      return [];
    }
  }

  return [];
}

/* Une meme adresse peut apparaitre deux fois — inscrite a deux activites,
   presente comme participante et comme partenaire. Sans ce regroupement, elle
   recevrait le message en double. */
function dedoublonner(destinataires) {
  const parAdresse = new Map();
  for (const d of destinataires) {
    const email = normaliser(d.email);
    if (!email.includes("@")) continue;
    if (!parAdresse.has(email)) parAdresse.set(email, { email, nom: d.full_name || email });
  }
  return [...parAdresse.values()];
}

/* ===== CONTENU ===== */

const echapper = (v) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Le mode est annonce comme « personnalise » : il faut donc qu'il le soit.
   Les valeurs sont echappees — un nom contenant « & » ou « < » casserait la
   mise en page, et un nom importe depuis un fichier n'est pas de confiance. */
function personnaliser(modele, destinataire) {
  const prenom = String(destinataire.nom || "").trim().split(/\s+/)[0] || "";
  return String(modele || "")
    .replace(/\{\{\s*nom\s*\}\}/gi, echapper(destinataire.nom || ""))
    .replace(/\{\{\s*prenom\s*\}\}/gi, echapper(prenom))
    .replace(/\{\{\s*email\s*\}\}/gi, echapper(destinataire.email));
}

/* L'en-tete List-Unsubscribe suffit a Gmail, mais pas a un destinataire qui
   lit depuis un client qui ne l'affiche pas. Le lien visible en pied de
   message est ce qui rend le desabonnement reellement accessible. */
function avecPiedDesabonnement(html, lien) {
  if (!lien) return html;
  return `${html}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6">
  Vous recevez ce message parce que vous avez participé à une activité du centre.<br>
  <a href="${lien}" style="color:#64748b">Se désabonner de ces envois</a>
</p>`;
}

function versTexte(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ===== PREPARATION ===== */

/**
 * Inscrit la liste des destinataires avant le premier envoi. La liste est
 * ainsi figee : ajouter un participant pendant l'envoi ne le fait pas entrer
 * dans une campagne deja lancee, et une reprise apres incident repart de la
 * meme liste.
 */
async function preparerEnvoi(camp) {
  const bruts = dedoublonner(await resoudreDestinataires(camp));
  const { retenus: abonnes, desabonnes } = await separerDesabonnes(bruts);

  /* Les adresses injoignables sont ecartees ici, avant d'etre remises au
     service d'envoi. Une adresse inventee ou mal recopiee ne coute rien a la
     plateforme — elle part et rebondit — mais elle coute le compte
     d'expedition : les rebonds sont surveilles, et un compte neuf qui rebondit
     des ses premiers envois est suspendu. C'est ce qui nous est arrive deux
     fois, apres des essais faits avec des adresses fictives. */
  const { retenus, rejetes } = await trierAdresses(abonnes);

  if (!retenus.length && !rejetes.length) {
    return { total: 0, desabonnes: desabonnes.length, injoignables: 0, retenus: [] };
  }

  /* ON CONFLICT DO NOTHING : une reprise ne recree pas les lignes deja
     traitees, donc ne renvoie rien a ceux qui ont deja recu. */
  if (retenus.length) {
    const valeurs = retenus.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(",");
    const params = [camp.id, ...retenus.flatMap((d) => [d.email, d.nom])];
    await pool.query(
      `INSERT INTO campagne_envois (campagne_id, email, nom) VALUES ${valeurs}
       ON CONFLICT (campagne_id, email) DO NOTHING`,
      params
    );
  }

  /* Les adresses injoignables sont inscrites au journal, jamais en attente :
     « Reprendre les restants » ne doit pas les representer au fournisseur. */
  for (const d of rejetes) {
    await pool.query(
      `INSERT INTO campagne_envois (campagne_id, email, nom, statut, erreur, traite_le)
       VALUES ($1, $2, $3, 'injoignable', $4, NOW())
       ON CONFLICT (campagne_id, email) DO NOTHING`,
      [camp.id, d.email, d.nom, d.explication]
    );
  }

  /* Les desabonnes sont inscrits eux aussi, mais marques : sans cela on ne
     saurait pas expliquer l'ecart entre le nombre de participants et le
     nombre de messages partis. */
  for (const d of desabonnes) {
    await pool.query(
      `INSERT INTO campagne_envois (campagne_id, email, nom, statut, traite_le)
       VALUES ($1, $2, $3, 'desabonne', NOW())
       ON CONFLICT (campagne_id, email) DO NOTHING`,
      [camp.id, d.email, d.nom]
    );
  }

  const total = await pool.query(`SELECT COUNT(*)::int AS n FROM campagne_envois WHERE campagne_id = $1`, [camp.id]);
  await pool.query(`UPDATE campagnes SET total_count = $1 WHERE id = $2`, [total.rows[0].n, camp.id]);

  return {
    total: total.rows[0].n,
    desabonnes: desabonnes.length,
    injoignables: rejetes.length,
    retenus,
  };
}

/* ===== EXECUTION ===== */

async function executerEnvoi(campagneId, baseUrl) {
  try {
    const campRes = await pool.query("SELECT * FROM campagnes WHERE id=$1", [campagneId]);
    if (!campRes.rows.length) return;
    const camp = campRes.rows[0];

    const mode = camp.send_mode === "bcc" ? "bcc" : "publipostage";

    if (mode === "bcc") {
      await envoyerEnCopieCachee(camp, baseUrl);
    } else {
      await envoyerUnParUn(camp, baseUrl);
    }
  } catch (err) {
    console.error(`[campagne ${campagneId}] envoi interrompu :`, err.message);
    await pool
      .query(`UPDATE campagnes SET status='echouee', last_error=$1, finished_at=NOW() WHERE id=$2`, [
        err.message,
        campagneId,
      ])
      .catch(() => {});
  } finally {
    enCours.delete(campagneId);
    await cloturer(campagneId).catch(() => {});
  }
}

async function envoyerUnParUn(camp, baseUrl) {
  /* On relit a chaque tour plutot que de charger toute la liste : un envoi
     peut durer plusieurs minutes, et l'administrateur doit pouvoir supprimer
     ou arreter la campagne entre-temps. */
  for (;;) {
    const lot = await pool.query(
      `SELECT id, email, nom FROM campagne_envois
        WHERE campagne_id = $1 AND statut = 'en_attente'
        ORDER BY id LIMIT 20`,
      [camp.id]
    );
    if (!lot.rows.length) return;

    for (const ligne of lot.rows) {
      const encoreLa = await pool.query(`SELECT status FROM campagnes WHERE id=$1`, [camp.id]);
      if (!encoreLa.rows.length || encoreLa.rows[0].status === "arretee") return;

      const destinataire = { email: ligne.email, nom: ligne.nom };
      const lien = lienDesabonnement(baseUrl, ligne.email);
      const html = avecPiedDesabonnement(personnaliser(camp.html_body, destinataire), lien);

      try {
        await sendEmail({
          toEmail: ligne.email,
          toName: ligne.nom || ligne.email,
          subject: personnaliser(camp.subject, destinataire),
          html,
          text: versTexte(html),
          headers: entetesDesabonnement(baseUrl, ligne.email),
        });
        await pool.query(
          `UPDATE campagne_envois SET statut='envoye', erreur=NULL, traite_le=NOW() WHERE id=$1`,
          [ligne.id]
        );
      } catch (err) {
        console.error(`[campagne ${camp.id}] échec ${ligne.email} :`, err.message);
        await pool.query(
          `UPDATE campagne_envois SET statut='echec', erreur=$1, traite_le=NOW() WHERE id=$2`,
          [erreurLisible(err), ligne.id]
        );
      }

      await majCompteurs(camp.id);
      await pause(INTERVALLE_MS);
    }
  }
}

/* Un seul message, tout le monde en copie cachee. Personne ne voit l'adresse
   des autres, mais un seul corps de message part pour tout le monde : il ne
   peut donc porter aucun lien propre a un destinataire.
   Un premier jet y mettait le lien de l'expediteur : cliquer dessus aurait
   desabonne l'adresse d'envoi du centre, pas celle du lecteur. Le
   desabonnement passe donc par une reponse au message — c'est la forme de
   repli prevue par la norme (mailto), la seule honnete ici. */
async function envoyerEnCopieCachee(camp, baseUrl) {
  const lignes = await pool.query(
    `SELECT id, email, nom FROM campagne_envois WHERE campagne_id=$1 AND statut='en_attente' ORDER BY id`,
    [camp.id]
  );
  if (!lignes.rows.length) return;

  const expediteur = process.env.MAIL_FROM;
  const repondreA = process.env.MAIL_REPLY_TO || expediteur;
  const enTetes = repondreA
    ? { "List-Unsubscribe": `<mailto:${repondreA}?subject=Desabonnement>` }
    : {};
  const html = `${camp.html_body}
<hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px">
<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#64748b;line-height:1.6">
  Vous recevez ce message parce que vous avez participé à une activité du centre.<br>
  Pour ne plus recevoir ces informations, répondez à ce message avec le mot « Désabonnement ».
</p>`;

  /* Un envoi en copie cachee reste un envoi : au-dela de 500 destinataires,
     Exchange Online refuse le message entier. On decoupe. */
  const TAILLE = 400;
  for (let i = 0; i < lignes.rows.length; i += TAILLE) {
    const tranche = lignes.rows.slice(i, i + TAILLE);
    const ids = tranche.map((l) => l.id);
    try {
      await sendEmail({
        toEmail: expediteur,
        toName: process.env.MAIL_FROM_NAME || "Inside ODC",
        subject: camp.subject,
        html,
        text: versTexte(html),
        bcc: tranche.map((l) => ({ email: l.email, name: l.nom || l.email })),
        headers: enTetes,
      });
      await pool.query(
        `UPDATE campagne_envois SET statut='envoye', traite_le=NOW() WHERE id = ANY($1::int[])`,
        [ids]
      );
    } catch (err) {
      console.error(`[campagne ${camp.id}] échec du lot Cci :`, err.message);
      await pool.query(
        `UPDATE campagne_envois SET statut='echec', erreur=$1, traite_le=NOW() WHERE id = ANY($2::int[])`,
        [erreurLisible(err), ids]
      );
    }
    await majCompteurs(camp.id);
    await pause(INTERVALLE_MS);
  }
}

async function majCompteurs(campagneId) {
  await pool.query(
    `UPDATE campagnes c SET
       sent_count   = s.envoyes,
       failed_count = s.echecs
     FROM (
       SELECT COUNT(*) FILTER (WHERE statut='envoye')::int AS envoyes,
              COUNT(*) FILTER (WHERE statut='echec')::int  AS echecs
         FROM campagne_envois WHERE campagne_id = $1
     ) s
     WHERE c.id = $1`,
    [campagneId]
  );
}

/* Une campagne dont tous les messages ont echoue n'est pas « envoyee ». La
   distinction compte : c'est elle qui dit s'il faut relancer. */
async function cloturer(campagneId) {
  await majCompteurs(campagneId);
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE statut='en_attente')::int AS attente,
       COUNT(*) FILTER (WHERE statut='envoye')::int     AS envoyes,
       COUNT(*) FILTER (WHERE statut='echec')::int      AS echecs
     FROM campagne_envois WHERE campagne_id=$1`,
    [campagneId]
  );
  const { attente, envoyes, echecs } = r.rows[0];
  if (attente > 0) return; /* arret demande : on laisse l'etat en place */

  const statut = envoyes > 0 ? "envoyee" : echecs > 0 ? "echouee" : "envoyee";
  await pool.query(`UPDATE campagnes SET status=$1, finished_at=NOW() WHERE id=$2`, [statut, campagneId]);
}

/**
 * Detache l'envoi de la requete HTTP. Renvoie false si la campagne tourne
 * deja — l'appelant doit alors repondre que l'envoi est en cours, pas en
 * lancer un second.
 */
function lancerEnvoi(campagneId, baseUrl) {
  if (enCours.has(campagneId)) return false;
  enCours.add(campagneId);
  setImmediate(() => {
    executerEnvoi(campagneId, baseUrl);
  });
  return true;
}

function estEnCours(campagneId) {
  return enCours.has(campagneId);
}

module.exports = {
  resoudreDestinataires,
  dedoublonner,
  personnaliser,
  preparerEnvoi,
  lancerEnvoi,
  estEnCours,
  versTexte,
  avecPiedDesabonnement,
  DEBIT_PAR_MINUTE,
};
