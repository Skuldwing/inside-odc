const pool = require("../db");

/**
 * Les contrôles automatiques d'une déclaration d'activité.
 *
 * Ils ne décident de rien : ils signalent à l'administrateur ce qui mérite un
 * regard avant de valider. Chaque signal dit en clair ce qu'il a vu, avec les
 * chiffres, pour qu'on puisse juger sans refaire l'enquête. Réservés aux
 * administrateurs : un partenaire qui connaîtrait les règles saurait les
 * contourner.
 *
 * Trois niveaux :
 *  - « alerte »    : difficile à expliquer autrement que par une erreur ou une
 *                    fraude (même personne le même jour chez un autre
 *                    partenaire, un téléphone pour toute une salle) ;
 *  - « attention » : à regarder, souvent explicable ;
 *  - « info »      : utile pour juger, pas un défaut en soi.
 *
 * Tout se calcule par lots (une requête par contrôle pour toutes les
 * activités demandées) : la file de validation en affiche des dizaines.
 */

const SEUILS = {
  contactPartage: 3,        // fiches partageant un même téléphone ou email
  memeAppareil: 5,          // émargements QR depuis un même appareil
  ajoutTardifJours: 7,      // jours après la fin de l'activité
  volumeFacteur: 3,         // fois la médiane du partenaire
  volumeMin: 30,            // en dessous, un écart n'a pas de sens
  historiqueMin: 5,         // activités passées nécessaires pour une médiane
  activitesMemeJour: 3,     // activités du même partenaire le même jour
};

const DOMAINES_JETABLES = new Set([
  "yopmail.com", "yopmail.fr", "mailinator.com", "guerrillamail.com",
  "10minutemail.com", "tempmail.com", "temp-mail.org", "trashmail.com",
  "example.com", "example.org", "exemple.com", "exemple.fr", "test.com",
  "test.fr", "fake.com", "faux.com",
]);
const LOCAUX_FICTIFS = new Set([
  "test", "aaa", "aa", "a", "xxx", "xx", "x", "abc", "azerty", "qwerty",
  "none", "non", "pas", "aucun", "neant", "néant", "inconnu", "noemail", "nomail",
]);

/* Les neuf chiffres d'un numéro sénégalais, indicatif retiré. */
function chiffresTelephone(valeur) {
  let d = String(valeur || "").replace(/\D/g, "");
  if (d.startsWith("00221")) d = d.slice(5);
  else if (d.startsWith("221") && d.length === 12) d = d.slice(3);
  return d;
}
/* Mobiles 70, 75, 76, 77, 78 ; fixes 30, 33. */
function telephoneValide(d) {
  return /^(7[05678]\d{7}|3[03]\d{7})$/.test(d);
}
/* 77 777 77 77, 77 000 00 00, 77 123 45 67 : des numéros qu'on tape quand on
   n'en a pas. */
function telephoneFictif(d) {
  if (d.length < 9) return false;
  const corps = d.slice(2);
  if (new Set(corps).size <= 2) return true;
  return /0123456|1234567|2345678|3456789|9876543|8765432|7654321/.test(d);
}
function emailDouteux(valeur) {
  const e = String(valeur || "").trim().toLowerCase();
  if (!e) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return "format";
  const [local, domaine] = e.split("@");
  if (DOMAINES_JETABLES.has(domaine)) return "jetable";
  if (LOCAUX_FICTIFS.has(local)) return "fictif";
  return null;
}
function normaliserNom(nom, prenom) {
  return `${nom || ""}|${prenom || ""}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z|]+/g, " ").replace(/\s+/g, " ").trim();
}
function lisibleTelephone(d) {
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : d;
}
const pluriel = (n, mot, motPluriel) => `${n} ${n > 1 ? motPluriel || `${mot}s` : mot}`;
function mediane(valeurs) {
  if (!valeurs.length) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const ORDRE = { alerte: 0, attention: 1, info: 2 };

async function controlerActivites(idsBruts) {
  const ids = [...new Set((idsBruts || []).map(Number).filter(Number.isInteger))];
  const resultat = new Map(ids.map((id) => [id, { alertes: [], preuve: null }]));
  if (!ids.length) return resultat;
  const ajouter = (id, alerte) => resultat.get(Number(id))?.alertes.push(alerte);
  /* Un contrôle qui échoue ne doit pas emporter les autres. */
  const essayer = async (nom, fn) => {
    try {
      await fn();
    } catch (err) {
      console.warn(`[contrôles] ${nom} :`, err.message);
    }
  };

  const { rows: activites } = await pool.query(
    `SELECT a.id, a.activity_date::text AS jour,
            COALESCE(a.partner_id, uc.partner_id) AS partenaire,
            a.report_filename IS NOT NULL AS a_rapport,
            (SELECT COUNT(*) FROM activity_photos ph WHERE ph.activity_id = a.id)::int AS photos,
            (SELECT COUNT(*) FROM activity_participants ap WHERE ap.activity_id = a.id)::int AS effectif
       FROM activities a
       LEFT JOIN users uc ON uc.id = a.coach_id
      WHERE a.id = ANY($1::int[])`,
    [ids]
  );
  const parId = new Map(activites.map((a) => [Number(a.id), a]));
  const partenaires = [...new Set(activites.map((a) => a.partenaire).filter((p) => p != null))];

  /* ── Les fiches elles-mêmes : contacts, noms ── */
  await essayer("fiches", async () => {
    const { rows } = await pool.query(
      `SELECT ap.activity_id AS activite, p.id, p.nom, p.prenom, p.telephone, p.email
         FROM activity_participants ap
         JOIN participants p ON p.id = ap.participant_id
        WHERE ap.activity_id = ANY($1::int[])`,
      [ids]
    );
    const parActivite = new Map();
    for (const r of rows) {
      if (!parActivite.has(r.activite)) parActivite.set(r.activite, []);
      parActivite.get(r.activite).push(r);
    }
    for (const [activite, fiches] of parActivite) {
      const contacts = new Map();
      const noms = new Map();
      let invalides = 0;
      let fictifs = 0;
      const exemplesFictifs = [];
      const emailsDouteux = [];
      for (const f of fiches) {
        const d = chiffresTelephone(f.telephone);
        if (d) {
          if (d.length >= 8) {
            const cle = `tel:${d.slice(-9)}`;
            if (!contacts.has(cle)) contacts.set(cle, new Set());
            contacts.get(cle).add(f.id);
          }
          if (telephoneFictif(d)) {
            fictifs += 1;
            if (exemplesFictifs.length < 3) exemplesFictifs.push(lisibleTelephone(d));
          } else if (!telephoneValide(d)) {
            invalides += 1;
          }
        }
        const email = String(f.email || "").trim().toLowerCase();
        if (email) {
          const cle = `mail:${email}`;
          if (!contacts.has(cle)) contacts.set(cle, new Set());
          contacts.get(cle).add(f.id);
          const doute = emailDouteux(email);
          if (doute) emailsDouteux.push(email);
        }
        const nom = normaliserNom(f.nom, f.prenom);
        if (nom.replace(/[|\s]/g, "")) {
          if (!noms.has(nom)) noms.set(nom, { libelle: `${f.prenom || ""} ${f.nom || ""}`.trim(), ids: new Set() });
          noms.get(nom).ids.add(f.id);
        }
      }

      const partages = [...contacts.entries()]
        .filter(([, s]) => s.size >= SEUILS.contactPartage)
        .sort((a, b) => b[1].size - a[1].size);
      if (partages.length) {
        const exemples = partages.slice(0, 3).map(([cle, s]) => {
          const valeur = cle.startsWith("tel:") ? lisibleTelephone(cle.slice(4)) : cle.slice(5);
          return `« ${valeur} » sur ${s.size} fiches`;
        });
        ajouter(activite, {
          code: "contact_partage",
          niveau: "alerte",
          titre: "Un même contact pour plusieurs personnes",
          detail: exemples.join(" ; ") + (partages.length > 3 ? ` ; et ${partages.length - 3} autre(s)` : "") +
            ". Souvent, la personne qui a rempli la liste a mis son propre numéro.",
        });
      }
      if (fictifs) {
        ajouter(activite, {
          code: "telephone_fictif",
          niveau: "alerte",
          titre: `${pluriel(fictifs, "numéro")} manifestement inventé${fictifs > 1 ? "s" : ""}`,
          detail: `Par exemple ${exemplesFictifs.join(", ")}.`,
        });
      }
      if (invalides) {
        const part = invalides / fiches.length;
        ajouter(activite, {
          code: "telephone_invalide",
          niveau: part >= 0.2 ? "attention" : "info",
          titre: `${pluriel(invalides, "numéro")} au format inattendu`,
          detail: `${Math.round(part * 100)} % de la liste : ni un mobile (70, 75, 76, 77, 78), ni un fixe (30, 33) sénégalais à 9 chiffres.`,
        });
      }
      if (emailsDouteux.length) {
        ajouter(activite, {
          code: "email_douteux",
          niveau: emailsDouteux.length >= 3 ? "attention" : "info",
          titre: `${pluriel(emailsDouteux.length, "adresse")} email douteuse${emailsDouteux.length > 1 ? "s" : ""}`,
          detail: `Format invalide, adresse jetable ou de test : ${emailsDouteux.slice(0, 3).join(", ")}${emailsDouteux.length > 3 ? "…" : ""}.`,
        });
      }
      const doubles = [...noms.values()].filter((n) => n.ids.size >= 2);
      if (doubles.length) {
        ajouter(activite, {
          code: "nom_double",
          niveau: "attention",
          titre: `${pluriel(doubles.length, "personne")} inscrite${doubles.length > 1 ? "s" : ""} deux fois`,
          detail: `Même nom et même prénom sur deux fiches : ${doubles.slice(0, 3).map((n) => n.libelle).join(", ")}${doubles.length > 3 ? "…" : ""}. L'effectif est gonflé d'autant.`,
        });
      }
    }
  });

  /* ── Les mêmes personnes chez d'autres partenaires ── */
  await essayer("autres partenaires", async () => {
    const { rows } = await pool.query(
      `WITH cible AS (
         SELECT a.id, a.activity_date, COALESCE(a.partner_id, uc.partner_id) AS partenaire
           FROM activities a LEFT JOIN users uc ON uc.id = a.coach_id
          WHERE a.id = ANY($1::int[])
       ), autres AS (
         SELECT c.id AS cible, ap.participant_id,
                (b.activity_date = c.activity_date) AS meme_jour,
                b.title, pb.name AS partenaire_nom
           FROM cible c
           JOIN activity_participants ap ON ap.activity_id = c.id
           JOIN activity_participants bp ON bp.participant_id = ap.participant_id
                                         AND bp.activity_id <> c.id
           JOIN activities b ON b.id = bp.activity_id
           LEFT JOIN users ub ON ub.id = b.coach_id
           LEFT JOIN partners pb ON pb.id = COALESCE(b.partner_id, ub.partner_id)
          WHERE COALESCE(b.partner_id, ub.partner_id) IS DISTINCT FROM c.partenaire
       )
       SELECT cible,
              COUNT(DISTINCT participant_id) FILTER (WHERE meme_jour)::int AS meme_jour,
              COUNT(DISTINCT participant_id)::int AS ailleurs,
              ARRAY_AGG(DISTINCT title) FILTER (WHERE meme_jour) AS titres_meme_jour,
              ARRAY_AGG(DISTINCT partenaire_nom) FILTER (WHERE partenaire_nom IS NOT NULL) AS partenaires
         FROM autres GROUP BY cible`,
      [ids]
    );
    for (const r of rows) {
      const effectif = parId.get(Number(r.cible))?.effectif || 0;
      if (r.meme_jour > 0) {
        ajouter(r.cible, {
          code: "meme_jour_ailleurs",
          niveau: "alerte",
          titre: `${pluriel(r.meme_jour, "personne")} déclarée${r.meme_jour > 1 ? "s" : ""} le même jour chez un autre partenaire`,
          detail: `Aussi présente${r.meme_jour > 1 ? "s" : ""} dans : ${(r.titres_meme_jour || []).slice(0, 3).map((t) => `« ${t} »`).join(", ")}.`,
        });
      }
      if (r.ailleurs > 0) {
        const part = effectif ? r.ailleurs / effectif : 0;
        ajouter(r.cible, {
          code: "autre_partenaire",
          niveau: part >= 0.5 ? "attention" : "info",
          titre: `${pluriel(r.ailleurs, "personne")} déjà comptée${r.ailleurs > 1 ? "s" : ""} par un autre partenaire`,
          detail: `${Math.round(part * 100)} % de la liste${(r.partenaires || []).length ? `, chez ${(r.partenaires || []).slice(0, 3).join(", ")}${r.partenaires.length > 3 ? "…" : ""}` : ""}. Normal pour un public fidèle, suspect si c'est toute la liste.`,
        });
      }
    }
  });

  /* ── Les émargements par QR code ── */
  const emargesQr = new Map();
  await essayer("émargements", async () => {
    const { rows } = await pool.query(
      `SELECT l.resource_id::int AS activite, l.ip_address AS ip,
              l.details->>'navigateur' AS navigateur,
              l.details->>'participant_id' AS participant,
              (l.created_at::date > COALESCE(a.date_fin, a.activity_date) + 1) AS apres_coup
         FROM audit_logs l
         JOIN activities a ON a.id::text = l.resource_id
        WHERE l.resource = 'activities' AND l.action = 'CHECKIN'
          AND l.resource_id = ANY($1::text[])`,
      [ids.map(String)]
    );
    const parActivite = new Map();
    for (const r of rows) {
      if (!parActivite.has(r.activite)) parActivite.set(r.activite, []);
      parActivite.get(r.activite).push(r);
    }
    for (const [activite, logs] of parActivite) {
      emargesQr.set(activite, new Set(logs.map((l) => l.participant).filter(Boolean)).size);
      /* Un même appareil : même adresse IP ET même navigateur. L'adresse
         seule ne suffit pas — toute une salle sur le même wifi la partage. */
      const appareils = new Map();
      for (const l of logs) {
        if (!l.navigateur || !l.ip) continue;
        const cle = `${l.ip}|${l.navigateur}`;
        appareils.set(cle, (appareils.get(cle) || 0) + 1);
      }
      const max = Math.max(0, ...appareils.values());
      if (max >= SEUILS.memeAppareil) {
        ajouter(activite, {
          code: "meme_appareil",
          niveau: "alerte",
          titre: `${max} émargements faits depuis un même téléphone`,
          detail: "Même adresse réseau et même navigateur : une seule personne a probablement émargé pour les autres.",
        });
      }
      const apresCoup = logs.filter((l) => l.apres_coup).length;
      if (apresCoup) {
        ajouter(activite, {
          code: "emargement_apres_coup",
          niveau: "attention",
          titre: `${pluriel(apresCoup, "émargement")} après la fin de l'activité`,
          detail: "Le QR code a servi plus d'un jour après la date de fin.",
        });
      }
    }
  });

  /* ── Les fiches ajoutées longtemps après ──
     La date d'ajout n'existe que depuis une migration qui a daté toutes les
     fiches de ce jour-là : celles-là ne disent rien et sont écartées. */
  await essayer("ajouts tardifs", async () => {
    const { rows } = await pool.query(
      `SELECT ap.activity_id AS activite, COUNT(*)::int AS n
         FROM activity_participants ap
         JOIN activities a ON a.id = ap.activity_id
        WHERE ap.activity_id = ANY($1::int[])
          AND ap.registered_at > (COALESCE(a.date_fin, a.activity_date) + $2::int)
          AND ap.registered_at > (SELECT MIN(registered_at) FROM activity_participants) + INTERVAL '1 minute'
        GROUP BY 1`,
      [ids, SEUILS.ajoutTardifJours]
    );
    for (const r of rows) {
      const effectif = parId.get(Number(r.activite))?.effectif || 0;
      const toute = r.n >= effectif;
      ajouter(r.activite, {
        code: "ajout_tardif",
        niveau: toute ? "info" : "attention",
        titre: toute
          ? `Liste saisie plus de ${SEUILS.ajoutTardifJours} jours après l'activité`
          : `${pluriel(r.n, "personne")} ajoutée${r.n > 1 ? "s" : ""} plus de ${SEUILS.ajoutTardifJours} jours après l'activité`,
        detail: toute
          ? "Toute la liste est arrivée tard : demandez la feuille d'émargement signée."
          : "La liste s'est allongée après coup : à rapprocher de la feuille d'émargement.",
      });
    }
  });

  /* ── Le volume, comparé à l'habitude du partenaire ── */
  await essayer("volume", async () => {
    if (!partenaires.length) return;
    const { rows } = await pool.query(
      `SELECT COALESCE(b.partner_id, ub.partner_id) AS partenaire, b.id, COUNT(ap.participant_id)::int AS n
         FROM activities b
         LEFT JOIN users ub ON ub.id = b.coach_id
         JOIN activity_participants ap ON ap.activity_id = b.id
        WHERE COALESCE(b.partner_id, ub.partner_id) = ANY($1::int[])
        GROUP BY 1, 2`,
      [partenaires]
    );
    for (const a of activites) {
      if (a.partenaire == null || a.effectif < SEUILS.volumeMin) continue;
      const autres = rows.filter((r) => r.partenaire === a.partenaire && Number(r.id) !== Number(a.id)).map((r) => r.n);
      if (autres.length < SEUILS.historiqueMin) continue;
      const m = mediane(autres);
      if (m && a.effectif > SEUILS.volumeFacteur * m) {
        ajouter(a.id, {
          code: "volume_inhabituel",
          niveau: "attention",
          titre: "Effectif inhabituel pour ce partenaire",
          detail: `${a.effectif} participants, contre ${Math.round(m)} d'habitude (médiane de ses ${autres.length} autres activités).`,
        });
      }
    }
    const { rows: jours } = await pool.query(
      `SELECT COALESCE(b.partner_id, ub.partner_id) AS partenaire, b.activity_date::text AS jour, COUNT(*)::int AS n
         FROM activities b LEFT JOIN users ub ON ub.id = b.coach_id
        WHERE COALESCE(b.partner_id, ub.partner_id) = ANY($1::int[])
        GROUP BY 1, 2 HAVING COUNT(*) >= $2`,
      [partenaires, SEUILS.activitesMemeJour]
    );
    for (const a of activites) {
      const j = jours.find((x) => x.partenaire === a.partenaire && x.jour === a.jour);
      if (j) {
        ajouter(a.id, {
          code: "activites_meme_jour",
          niveau: "attention",
          titre: `${j.n} activités déclarées le même jour par ce partenaire`,
          detail: "Possible si plusieurs salles tournent en parallèle ; sinon, une déclaration en double.",
        });
      }
    }
  });

  /* ── Ce que disent les bénéficiaires interrogés, et les visites ──
     Les tables n'existent qu'une fois la contre-vérification installée :
     d'ici là, ces deux contrôles se taisent. */
  await essayer("contre-vérification", async () => {
    const { rows } = await pool.query(
      `SELECT activity_id AS activite,
              COUNT(*) FILTER (WHERE reponse = 'non')::int AS non,
              COUNT(*) FILTER (WHERE reponse = 'oui')::int AS oui
         FROM verifications_beneficiaires
        WHERE activity_id = ANY($1::int[]) AND reponse IS NOT NULL
        GROUP BY 1`,
      [ids]
    );
    for (const r of rows) {
      if (!r.non) continue;
      ajouter(r.activite, {
        code: "beneficiaire_dement",
        niveau: "alerte",
        titre: `${pluriel(r.non, "bénéficiaire interrogé dit", "bénéficiaires interrogés disent")} ne pas avoir participé`,
        detail: `Sur ${r.non + r.oui} réponse${r.non + r.oui > 1 ? "s" : ""} à la contre-vérification par email.`,
      });
    }
  });
  await essayer("visites", async () => {
    const { rows } = await pool.query(
      `SELECT activity_id AS activite, effectif_constate, visite_le::text AS le
         FROM visites_inopinees
        WHERE activity_id = ANY($1::int[]) AND effectif_constate IS NOT NULL`,
      [ids]
    );
    for (const r of rows) {
      const declare = parId.get(Number(r.activite))?.effectif || 0;
      const marge = Math.max(3, Math.ceil(r.effectif_constate * 0.2));
      if (declare > r.effectif_constate + marge) {
        ajouter(r.activite, {
          code: "visite_ecart",
          niveau: "alerte",
          titre: "La liste dépasse ce qu'a constaté la visite",
          detail: `${declare} personnes déclarées, ${r.effectif_constate} constatées lors de la visite inopinée${r.le ? ` du ${r.le.split("-").reverse().join("/")}` : ""}.`,
        });
      }
    }
  });

  /* ── Les preuves disponibles ── */
  for (const a of activites) {
    const qr = emargesQr.get(Number(a.id)) || 0;
    const preuve = { effectif: a.effectif, emargements_qr: qr, rapport: a.a_rapport, photos: a.photos };
    resultat.get(Number(a.id)).preuve = preuve;
    if (a.effectif > 0 && !qr && !a.a_rapport && !a.photos) {
      ajouter(a.id, {
        code: "sans_preuve",
        niveau: "attention",
        titre: "Aucune preuve de présence",
        detail: "Ni émargement par QR code, ni rapport, ni photo : la liste repose sur la seule déclaration.",
      });
    }
  }

  for (const r of resultat.values()) r.alertes.sort((x, y) => ORDRE[x.niveau] - ORDRE[y.niveau]);
  return resultat;
}

module.exports = {
  controlerActivites,
  SEUILS,
  chiffresTelephone,
  telephoneValide,
  telephoneFictif,
  emailDouteux,
};
