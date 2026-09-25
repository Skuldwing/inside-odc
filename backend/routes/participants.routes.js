const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const { logAudit } = require("../services/audit");
const {
  prenomSansNomRepete, repetitionsDans, clePersonne, cleApprochee,
  nomsCompatibles, nomsProches,
} = require("../services/nomsDoublons");
const { computeAndStoreReliability } = require("../services/reliability");
const { trierAdresses } = require("../services/adressesValides");
const {
  classerParAssiduite, agesIncompatibles, genresIncompatibles,
} = require("../services/assiduite");
const { DEPLIE, deplier, conditionsDeRecherche } = require("../services/rechercheTexte");
const { reunir, defaire } = require("../services/identite");
const { contactsCollectifs } = require("../services/contactsCollectifs");

const router = express.Router();

const PAGE_SIZE = 100;

/* Taille des lots ecrits dans la reponse lors de l'export. Le fichier est
   envoye au fil de l'eau plutot que construit entierement en memoire :
   une base de plusieurs dizaines de milliers de lignes ne doit pas faire
   gonfler le processus. */
const EXPORT_BATCH = 2000;

/* Les colonnes ou l'on cherche du texte. Le nom et le prenom sont separes en
   base : sans cette liste, « aminata ndiaye » ne trouvait rien, puisque la
   chaine entiere etait cherchee dans chaque colonne prise isolement. */
const COLONNES_TEXTE = [
  "p.nom", "p.prenom", "p.structure", "p.email", "p.statut",
  "a.title", "pr.name", "d.name",
];

/* Filtres et cloisonnement, partages par la liste paginee et l'export.
   Les deux vues doivent voir exactement le meme perimetre : un partenaire
   n'exporte que ses propres participants, un coach que les siens. */
function buildFilters(req) {
  const search = (req.query.search || "").trim();
  const genre = req.query.genre || "";
  const dispositif = req.query.dispositif || "";
  const partenaire = req.query.partenaire || "";
  const statut = (req.query.statut || "").trim();
  const age = (req.query.age || "").trim();
  const du = (req.query.du || "").trim();
  const au = (req.query.au || "").trim();

  const conditions = [];
  const params = [];
  let idx = 1;

  if (req.user.role === "partner") {
    conditions.push(`a.partner_id = $${idx++}`);
    params.push(req.user.partner_id);
  } else if (req.user.role === "coach") {
    conditions.push(`a.coach_id = $${idx++}`);
    params.push(req.user.id);
  }

  if (genre) {
    conditions.push(`p.genre = $${idx++}`);
    params.push(genre);
  }

  if (dispositif) {
    conditions.push(`a.device_id = $${idx++}`);
    params.push(dispositif);
  }

  if (partenaire) {
    conditions.push(`a.partner_id = $${idx++}`);
    params.push(partenaire);
  }

  if (statut) {
    conditions.push(`${DEPLIE("p.statut")} = $${idx++}`);
    params.push(deplier(statut));
  }

  if (age) {
    conditions.push(`p.age_range = $${idx++}`);
    params.push(age);
  }

  /* Bornes de la date d'activite. Chacune vaut seule : « depuis le 1er
     janvier » est une demande aussi courante que « entre deux dates ». */
  if (du) {
    conditions.push(`a.activity_date >= $${idx++}`);
    params.push(du);
  }
  if (au) {
    conditions.push(`a.activity_date <= $${idx++}`);
    params.push(au);
  }

  /* Mot a mot, accents plies, numero compare chiffre a chiffre : les regles
     sont dans le service, partagees avec la barre de recherche globale. */
  const r = conditionsDeRecherche(search, {
    colonnes: COLONNES_TEXTE, telephone: "p.telephone", depart: idx,
  });
  conditions.push(...r.conditions);
  params.push(...r.params);
  idx = r.nextIdx;

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const baseFrom = `
    FROM participants p
    JOIN activity_participants ap ON ap.participant_id = p.id
    JOIN activities a ON a.id = ap.activity_id
    LEFT JOIN partners pr ON pr.id = a.partner_id
    LEFT JOIN devices   d  ON d.id  = a.device_id
    ${where}
  `;

  return {
    baseFrom, params, nextIdx: idx,
    search, genre, dispositif, partenaire, statut, age, du, au,
  };
}

/* ===== VALEURS DISPONIBLES POUR LES FILTRES =====
   Les listes deroulantes se remplissent depuis ce qui existe reellement dans
   le perimetre de la personne connectee : proposer un dispositif dont elle ne
   verra aucune ligne n'aide personne, et un partenaire n'a pas a decouvrir le
   nom des autres. On ne passe donc pas par /partners et /devices — le premier
   est d'ailleurs reserve aux administrateurs. */
router.get("/filtres", authMiddleware, async (req, res) => {
  try {
    /* Le perimetre seul : les filtres en cours ne doivent pas retirer des
       choix de la liste, sans quoi on ne pourrait plus revenir en arriere. */
    const perimetre = buildFilters({ user: req.user, query: {} });

    const { rows } = await pool.query(`
      SELECT
        json_agg(DISTINCT jsonb_build_object('id', d.id, 'nom', d.name))
          FILTER (WHERE d.id IS NOT NULL)                       AS dispositifs,
        json_agg(DISTINCT jsonb_build_object('id', pr.id, 'nom', pr.name))
          FILTER (WHERE pr.id IS NOT NULL)                      AS partenaires,
        json_agg(DISTINCT p.statut)    FILTER (WHERE nullif(trim(p.statut), '')    IS NOT NULL) AS statuts,
        json_agg(DISTINCT p.age_range) FILTER (WHERE nullif(trim(p.age_range), '') IS NOT NULL) AS ages,
        min(a.activity_date) AS premiere,
        max(a.activity_date) AS derniere
      ${perimetre.baseFrom}
    `, perimetre.params);

    const l = rows[0] || {};
    const parNom = (a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr");
    res.json({
      dispositifs: (l.dispositifs || []).sort(parNom),
      partenaires: (l.partenaires || []).sort(parNom),
      statuts: (l.statuts || []).sort((a, b) => String(a).localeCompare(String(b), "fr")),
      ages: (l.ages || []).sort((a, b) => String(a).localeCompare(String(b), "fr", { numeric: true })),
      premiere: l.premiere || null,
      derniere: l.derniere || null,
    });
  } catch (err) {
    console.error("[PARTICIPANTS FILTRES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== GET PARTICIPANTS (pagine, filtre cote serveur) ===== */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const { baseFrom, params, nextIdx } = buildFilters(req);

    const [statsRes, dataRes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int                                     AS total,
          COUNT(*) FILTER (WHERE p.genre = 'H')::int       AS male,
          COUNT(*) FILTER (WHERE p.genre = 'F')::int       AS female
        ${baseFrom}
      `, params),
      pool.query(`
        SELECT
          p.*,
          a.id            AS activity_id,
          a.title         AS activite,
          a.activity_date AS date_activite,
          pr.name         AS partenaire,
          d.name          AS dispositif
        ${baseFrom}
        ORDER BY a.activity_date DESC, p.nom, p.prenom
        LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
      `, [...params, PAGE_SIZE, offset]),
    ]);

    const { total, male, female } = statsRes.rows[0];
    res.json({
      rows:  dataRes.rows,
      total,
      male,
      female,
      page,
      pages: Math.ceil(total / PAGE_SIZE),
      limit: PAGE_SIZE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== EXPORT CSV =====
   L'export du navigateur ne portait que sur la page affichee : au-dela de
   100 lignes, le fichier etait silencieusement incomplet. Il est desormais
   produit ici, sur l'ensemble des lignes correspondant aux filtres en cours. */

const CSV_HEADERS = [
  "Nom", "Prénom", "Structure/Établissement", "Genre", "Tranche d'âge",
  "Email", "Téléphone", "Statut", "Activité", "Date activité",
  "Partenaire", "Dispositif",
];

function csvCell(value) {
  if (value == null) return "";
  let text = String(value);
  /* Une cellule commencant par =, +, - ou @ est interpretee comme une formule
     par Excel : on la neutralise en la prefixant d'une apostrophe. */
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  text = text.replace(/"/g, '""');
  return /[;"\n\r]/.test(text) ? `"${text}"` : text;
}

function csvLine(cells) {
  return cells.map(csvCell).join(";");
}

router.get("/export.csv", authMiddleware, async (req, res) => {
  try {
    const { baseFrom, params, nextIdx, search, genre } = buildFilters(req);

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, params);
    const total = countRes.rows[0].total;

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="participants-odc-${stamp}.csv"`);
    /* Le nombre total permet a l'interface de confirmer ce qui a ete telecharge. */
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count, Content-Disposition");

    /* BOM : sans lui, Excel lit le fichier en ANSI et casse les accents. */
    res.write("﻿");
    res.write(csvLine(CSV_HEADERS) + "\r\n");

    for (let offset = 0; offset < total; offset += EXPORT_BATCH) {
      const batch = await pool.query(`
        SELECT p.nom, p.prenom, p.structure, p.genre, p.age_range,
               p.email, p.telephone, p.statut,
               a.title AS activite,
               to_char(a.activity_date, 'YYYY-MM-DD') AS date_activite,
               pr.name AS partenaire,
               d.name  AS dispositif
        ${baseFrom}
        ORDER BY a.activity_date DESC, p.nom, p.prenom
        LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
      `, [...params, EXPORT_BATCH, offset]);

      for (const r of batch.rows) {
        res.write(
          csvLine([
            r.nom, r.prenom, r.structure, r.genre, r.age_range,
            r.email, r.telephone, r.statut, r.activite, r.date_activite,
            r.partenaire, r.dispositif,
          ]) + "\r\n"
        );
      }
    }

    res.end();

    /* Un export de donnees personnelles en masse merite d'etre trace. */
    logAudit(req, "EXPORT", "participants", null, `${total} participant(s)`, {
      total,
      filtres: { recherche: search || null, genre: genre || null },
    });
  } catch (err) {
    console.error("[EXPORT PARTICIPANTS]", err);
    /* Si l'ecriture a commence, les en-tetes sont deja partis : on ne peut
       plus renvoyer un JSON d'erreur, on coupe le flux. */
    if (res.headersSent) return res.end();
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== ASSIDUITE =====
 *
 * Combien de modules une personne a suivis, et lesquels. Le classement met en
 * tete les plus assidus : ce sont eux que l'on veut reconnaitre, relancer ou
 * orienter vers la suite du parcours.
 *
 * Le rapprochement des fiches vit dans son propre service, qui l'explique et
 * que l'on peut eprouver a part. Ici, on se contente de lire le perimetre de
 * l'utilisateur et de le lui passer.
 */
router.get("/assiduite", authMiddleware, async (req, res) => {
  try {
    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.email, p.telephone, p.genre, p.structure, p.age_range,
              a.id AS activity_id, a.title AS titre,
              to_char(a.activity_date, 'YYYY-MM-DD') AS date,
              d.name AS dispositif
       ${baseFrom}
       ORDER BY p.id`,
      params
    );

    const classement = classerParAssiduite(r.rows);
    res.json({
      personnes: classement.length,
      /* Ce que l'on regarde en premier : combien reviennent. Une personne qui
         n'est venue qu'une fois n'est pas un parcours, c'est un passage. */
      fideles: classement.filter((x) => x.total_modules > 1).length,
      homonymes: classement.filter((x) => x.homonymes).length,
      classement,
    });
  } catch (err) {
    console.error("[ASSIDUITE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Le meme classement en CSV. L'ecran montre les premiers ; un bilan se fait
   dans un tableur, avec les modules de chacun sur la ligne. */
router.get("/assiduite/export.csv", authMiddleware, async (req, res) => {
  try {
    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT p.id, p.nom, p.prenom, p.email, p.telephone, p.genre, p.structure, p.age_range,
              a.id AS activity_id, a.title AS titre,
              to_char(a.activity_date, 'YYYY-MM-DD') AS date,
              d.name AS dispositif
       ${baseFrom}
       ORDER BY p.id`,
      params
    );
    const classement = classerParAssiduite(r.rows);

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="assiduite-odc-${stamp}.csv"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.write("\ufeff");
    res.write(csvLine([
      "Rang", "Nom", "Prénom", "Modules suivis", "Email", "Téléphone",
      "Genre", "Structure", "Homonyme possible", "Modules",
    ]) + "\r\n");

    classement.forEach((x, i) => {
      res.write(csvLine([
        i + 1, x.nom, x.prenom, x.total_modules, x.email, x.telephone,
        x.genre, x.structure, x.homonymes ? "oui" : "",
        x.modules.map((m) => `${m.titre}${m.date ? ` (${m.date})` : ""}`).join(" | "),
      ]) + "\r\n");
    });
    res.end();

    logAudit(req, "EXPORT", "participants", null, `assiduité — ${classement.length} personne(s)`, {
      personnes: classement.length,
    });
  } catch (err) {
    console.error("[EXPORT ASSIDUITE]", err);
    if (res.headersSent) return res.end();
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== NOMS DE FAMILLE ECRITS DEUX FOIS =====
   Les imports deja effectues portent la meme repetition que les nouveaux. La
   detection ne peut pas se faire en SQL — elle compare des mots en ignorant
   casse et accents — alors on la fait ici, sur les seules colonnes utiles. */
router.get("/doublons-nom", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    /* Le cloisonnement des roles s'applique : un partenaire ne voit, et ne
       corrige, que les participants de ses propres activites. */
    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email ${baseFrom} ORDER BY p.nom, p.prenom`,
      params
    );

    const trouves = repetitionsDans(r.rows).map(({ ligne, propose }) => ({
      id: ligne.id,
      nom: ligne.nom,
      prenom: ligne.prenom,
      email: ligne.email,
      prenom_corrige: propose,
    }));

    res.json({ total: trouves.length, participants: trouves });
  } catch (err) {
    console.error("[DOUBLONS NOM]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* La correction s'applique aux identifiants transmis, jamais « a tout ce qui
   correspond » : l'appelant a vu la liste, il corrige ce qu'il a vu. Entre
   l'affichage et le clic, la base a pu changer — on reverifie donc chaque
   ligne avant de la toucher. */
router.post("/doublons-nom/corriger", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "Aucun participant à corriger." });
    if (ids.length > 1000) return res.status(400).json({ error: "Trop de participants en une fois." });

    /* On relit le perimetre autorise exactement comme la liste l'a construit,
       puis on ne garde que les identifiants demandes. Greffer un « AND » sur
       baseFrom serait plus court, mais cette clause n'a pas toujours de WHERE
       devant elle — un administrateur sans filtre n'en produit aucun — et la
       requete deviendrait invalide selon l'appelant. */
    const { baseFrom, params } = buildFilters(req);
    const portee = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom ${baseFrom}`,
      params
    );
    const demandes = new Set(ids);
    const lignes = portee.rows.filter((x) => demandes.has(x.id));

    let corriges = 0;
    const ignores = [];
    for (const ligne of lignes) {
      const propose = prenomSansNomRepete(ligne.prenom, ligne.nom);
      if (!propose) {
        ignores.push(ligne.id);
        continue;
      }
      await pool.query("UPDATE participants SET prenom = $1 WHERE id = $2", [propose, ligne.id]);
      logAudit(req, "UPDATE", "participants", ligne.id, `${propose} ${ligne.nom}`, {
        avant: `${ligne.prenom} ${ligne.nom}`,
        apres: `${propose} ${ligne.nom}`,
        motif: "nom de famille écrit deux fois",
      });
      corriges += 1;
    }

    res.json({ corriges, ignores: ignores.length });
  } catch (err) {
    console.error("[DOUBLONS NOM CORRIGER]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== FICHES DE LA MEME PERSONNE =====
   Une personne suit plusieurs formations et figure sur autant de listes de
   presence. Ces listes ne portent pas les memes colonnes : l'une a les
   adresses, l'autre les telephones, une troisieme le genre et la structure.
   L'ancien import rapprochait les noms par egalite stricte et ne completait
   jamais une fiche existante : chaque liste creait donc une fiche de plus, et
   l'information d'une meme personne finissait eparpillee entre plusieurs
   fiches dont aucune n'etait complete.

   L'import ne les fabrique plus et complete ce qu'il reconnait. Restent celles
   d'avant, qu'il faut reunir : une seule fiche par personne, portant tout ce
   que les listes ont apporte, et inscrite a chacune de ses formations. */

const CHAMPS_FICHE = ["email", "telephone", "genre", "age_range", "statut", "structure"];

const LIBELLES_CHAMPS = {
  email: "email",
  telephone: "téléphone",
  genre: "genre",
  age_range: "tranche d'âge",
  statut: "statut",
  structure: "structure",
};

/* Un numero s'ecrit « 77 123 45 67 », « +221771234567 » ou « 00221 77 123 45 67 »
   selon la feuille : c'est le meme telephone. */
const telCompare = (v) => String(v || "").replace(/\D+/g, "").replace(/^(?:00221|221)/, "");
const mailCompare = (v) => String(v || "").trim().toLowerCase();

/* Deux ecritures d'une meme valeur ne sont pas un desaccord : « UCAD » et
   « ucad » designent la meme structure, « Foo@X.com » et « foo@x.com » la meme
   boite. On compare donc des formes normalisees.

   Le telephone passe par la meme comparaison que le rapprochement : n'en oter
   que les espaces faisait passer « 77 123 45 67 » et « +221771234567 » pour un
   desaccord — sur un groupe que ce numero-la venait precisement de reunir. */
function valeurNormalisee(champ, valeur) {
  if (valeur === null || valeur === undefined || String(valeur).trim() === "") return null;
  if (champ === "telephone") return telCompare(valeur) || null;
  return String(valeur).trim().toLowerCase();
}

function renseignes(fiche) {
  return CHAMPS_FICHE.filter((c) => valeurNormalisee(c, fiche[c]) !== null).length;
}

/* ===== OUTILS DE RAPPROCHEMENT =====
 * Partages par les deux detections : les fiches d'une meme personne, et les
 * inscriptions en double sur une meme activite.
 */

/* Ensembles disjoints : chaque fiche commence seule, les rapprochements les
   reunissent. C'est ce qui permet a trois ecritures d'une meme personne de ne
   former qu'un groupe, meme si aucune paire ne se ressemble directement — la
   premiere se reconnait a son adresse, la troisieme a son numero. */
function racine(parents, x) {
  while (parents.get(x) !== x) {
    parents.set(x, parents.get(parents.get(x)));
    x = parents.get(x);
  }
  return x;
}

function unir(parents, a, b) {
  const ra = racine(parents, a);
  const rb = racine(parents, b);
  if (ra !== rb) parents.set(ra, rb);
}

/* Deux fiches que rien ne separe : elles ne portent pas deux adresses
   differentes, ni deux numeros differents. Une information absente ne separe
   personne — c'est le cas courant sur les listes a moitie remplies. */
function rienNeSepare(a, b) {
  const ma = mailCompare(a.email), mb = mailCompare(b.email);
  if (ma && mb && ma !== mb) return false;
  const ta = telCompare(a.telephone), tb = telCompare(b.telephone);
  if (ta && tb && ta !== tb) return false;
  /* Le genre et la tranche d'age decrivent la personne, pas ce qu'elle a
     fait. Deux fiches qui les declarent de facon incompatible ne sont pas la
     meme personne, meme si le nom est identique — un adulte et un enfant
     peuvent porter le meme. Les listes d'ateliers pour enfants ne portent
     souvent ni adresse ni numero : sans ce garde-fou, rien ne les separait
     d'un homonyme adulte. */
  if (genresIncompatibles(a.genre, b.genre)) return false;
  if (agesIncompatibles(a.age_range, b.age_range)) return false;
  return true;
}

/**
 * Reunit les fiches qui portent le meme contact et un nom compatible.
 *
 * Le contact seul ne designe pas une personne : une adresse de famille et un
 * telephone partage sont courants, et deux freres ne doivent pas devenir une
 * seule fiche. Le nom seul ne suffit pas non plus — c'est precisement ce qu'on
 * corrige ici. Les deux ensemble, si : la meme adresse et un nom qui dit la
 * meme chose en plus court ou en plus long (« Awa Diop » et « Awa Marie Diop »,
 * « Diop » sans prenom et « Awa Diop ») designent bien la meme personne. Il en
 * va de meme d'un nom mal orthographie sur l'une des listes (« Fatou Ndiaye »
 * et « Fatou Ndiay ») : avec la meme adresse a cote, c'est une faute de frappe,
 * pas une seconde personne.
 */
function unirParContact(parents, fiches) {
  /* Un contact collectif ne rapproche personne : le telephone d'un directeur
     d'ecole figure sur la liste de vingt enfants, et deux d'entre eux peuvent
     porter le meme nom de famille — « Diop » et « Awa Diop » seraient alors
     tenus pour compatibles, et reunis sur la foi d'un numero qui n'est ni a
     l'un ni a l'autre. */
  const collectifs = contactsCollectifs(fiches);

  const parContact = new Map();
  for (const f of fiches) {
    const m = mailCompare(f.email), t = telCompare(f.telephone);
    for (const [contact, partage] of [[m, collectifs.mails], [t, collectifs.tels]]) {
      if (!contact || partage.has(contact)) continue;
      if (!parContact.has(contact)) parContact.set(contact, []);
      parContact.get(contact).push(f);
    }
  }
  for (const memeContact of parContact.values()) {
    for (let i = 0; i < memeContact.length; i++) {
      for (let j = i + 1; j < memeContact.length; j++) {
        if (nomsCompatibles(memeContact[i], memeContact[j])
            || nomsProches(memeContact[i], memeContact[j])) {
          unir(parents, memeContact[i].id, memeContact[j].id);
        }
      }
    }
  }
}

/**
 * Les fiches d'une meme personne.
 *
 * Le rapprochement se faisait sur le seul nom, et seulement quand le nom ET le
 * prenom etaient renseignes. Trois personnes echappaient donc a la detection :
 * celle dont le prenom compose n'est ecrit en entier qu'une fois sur deux,
 * celle dont une fiche n'a pas de prenom, celle dont le nom est mal orthographie
 * sur l'une des listes. Leur adresse ou leur numero, eux, sont les memes.
 *
 * Deux rapprochements donc : l'identite, et le contact avec un nom compatible.
 * Le second reunit ce que le premier manquait sans confondre deux personnes qui
 * partagent une boite ou un telephone de famille.
 */
/* Les paires que quelqu'un a declarees distinctes, prêtes a etre consultees
   par analyserGroupes. La cle « a:b » range toujours le plus petit d'abord,
   comme la table. */
async function paresDistinctes() {
  try {
    const { rows } = await pool.query("SELECT fiche_a, fiche_b FROM identites_distinctes");
    return new Set(rows.map((r) => `${r.fiche_a}:${r.fiche_b}`));
  } catch (err) {
    /* La table n'existe pas encore : aucune decision n'a ete prise, et la
       detection doit continuer de fonctionner. */
    if (err?.code === "42P01") return new Set();
    throw err;
  }
}

/**
 * @param {Array} fiches
 * @param {Set<string>} [distinctes]  paires « a:b » dont quelqu'un a constate,
 *   en les regardant, qu'elles designent deux personnes.
 */
function analyserGroupes(fiches, distinctes = new Set()) {
  const parents = new Map(fiches.map((f) => [f.id, f.id]));
  /* Calcule sur tout le lot, pas groupe par groupe : c'est le nombre de
     personnes que le contact accompagne dans la base qui dit s'il est
     collectif, pas ce qu'on en voit dans un groupe de deux. */
  const contactsPartout = contactsCollectifs(fiches);

  const premiereDeLaCle = new Map();
  for (const f of fiches) {
    const cle = clePersonne(f.nom, f.prenom);
    if (!cle) continue;
    if (premiereDeLaCle.has(cle)) unir(parents, premiereDeLaCle.get(cle), f.id);
    else premiereDeLaCle.set(cle, f.id);
  }

  unirParContact(parents, fiches);

  const parCle = new Map();
  for (const f of fiches) {
    const r = racine(parents, f.id);
    if (!parCle.has(r)) parCle.set(r, []);
    parCle.get(r).push(f);
  }

  const resultat = [];
  for (const membres of parCle.values()) {
    if (membres.length < 2) continue;

    /* Quelqu'un a deja regarde ce groupe et dit que ce n'etait pas la meme
       personne. On ne le repropose pas : sans cela il revenait a chaque
       visite, et une revue de plusieurs centaines de cas ne se terminait
       jamais — on retranchait indefiniment les memes.

       Une seule paire tranchee suffit a ecarter le groupe. C'est volontaire
       et conservateur : si quelqu'un a separe deux de ces fiches, le groupe
       tel qu'il est propose ne tient plus, et le repropose entier reviendrait
       a reposer une question deja tranchee. */
    if (distinctes.size) {
      let tranche = false;
      for (let i = 0; i < membres.length && !tranche; i++) {
        for (let j = i + 1; j < membres.length; j++) {
          const [a, b] = membres[i].id < membres[j].id
            ? [membres[i].id, membres[j].id] : [membres[j].id, membres[i].id];
          if (distinctes.has(`${a}:${b}`)) { tranche = true; break; }
        }
      }
      if (tranche) continue;
    }

    /* Deja rattachees : ces fiches designent la meme personne, le compte est
       juste et il n'y a plus rien a decider. Les completer garde du sens —
       une case vide se remplit toujours —, mais proposer a nouveau leur
       rapprochement ferait croire a un travail en attente qui n'existe pas.
       On ne les ecarte donc que si elles n'ont rien a se donner non plus. */
    const identites = new Set(membres.map((f) => f.personne_id).filter(Boolean));
    const dejaUneSeulePersonne = identites.size === 1 && membres.every((f) => f.personne_id);

    /* La fiche conservee est la mieux renseignee — c'est celle qui a le moins
       a recevoir, donc celle dont le moins de valeurs seront ecartees. A
       egalite, la plus ancienne : son identifiant circule deja ailleurs. */
    const garder = [...membres].sort(
      (a, b) => renseignes(b) - renseignes(a) || a.id - b.id
    )[0];
    const absorber = membres.filter((f) => f.id !== garder.id);

    /* Ce que la fusion ajouterait a la fiche conservee, et ce sur quoi les
       fiches se contredisent. Un desaccord n'est pas forcement une erreur —
       une personne peut avoir change d'adresse — mais il se tranche a l'oeil,
       pas par une regle. */
    const apport = [];
    const conflits = [];
    for (const champ of CHAMPS_FICHE) {
      const valeurs = new Map(); // valeur normalisee → valeur affichable
      for (const f of membres) {
        const n = valeurNormalisee(champ, f[champ]);
        if (n !== null && !valeurs.has(n)) valeurs.set(n, String(f[champ]).trim());
      }
      if (valeurs.size === 0) continue;

      const surGarder = valeurNormalisee(champ, garder[champ]);
      if (valeurs.size > 1) {
        conflits.push({
          champ,
          libelle: LIBELLES_CHAMPS[champ],
          conserve: surGarder === null ? null : garder[champ],
          ecartees: [...valeurs.entries()].filter(([n]) => n !== surGarder).map(([, v]) => v),
        });
      } else if (surGarder === null) {
        const [, affichable] = [...valeurs.entries()][0];
        apport.push({ champ, libelle: LIBELLES_CHAMPS[champ], valeur: affichable });
      }
    }

    /* Le groupe ne s'est pas forme sur une identite unique : c'est le contact
       qui l'a reuni, et les noms sont ecrits differemment d'une fiche a
       l'autre. Le rapprochement reste solide — meme adresse ou meme numero, et
       un nom qui dit la meme chose en plus court ou en plus long — mais il se
       regarde avant d'etre valide, comme les desaccords. */
    const cles = new Set(membres.map((f) => clePersonne(f.nom, f.prenom)));
    const noms_differents = cles.size > 1 || cles.has(null);

    /* Sur quoi il a ete reconnu, pour que l'ecran le dise plutot que de laisser
       deviner pourquoi deux noms differents sont dans le meme groupe. */
    const partage = [];
    for (const [champ, comparer, collectifs] of [
      ["email", mailCompare, contactsPartout.mails],
      ["telephone", telCompare, contactsPartout.tels],
    ]) {
      const vus = new Map();
      for (const f of membres) {
        const v = comparer(f[champ]);
        if (v && !vus.has(v)) vus.set(v, String(f[champ]).trim());
      }
      /* Un contact collectif — le telephone d'une ecole, l'adresse d'un
         service — est partage par des gens differents : il ne prouve pas
         qu'il s'agit de la meme personne. */
      const seul = vus.size === 1 && !collectifs.has([...vus.keys()][0]);
      if (seul && membres.filter((f) => comparer(f[champ])).length > 1) {
        partage.push({ champ, libelle: LIBELLES_CHAMPS[champ], valeur: [...vus.values()][0] });
      }
    }

    /* Sur quoi le rapprochement repose vraiment, la meme regle que partout
       ailleurs. Une adresse ou un numero partage designe une personne : le
       rattachement peut se faire sans que personne ne tranche. Le nom, non —
       et un desaccord sur un renseignement stable l'interdit de toute facon. */
    const preuve = partage.length && !conflits.length ? "contact" : "nom_seul";

    /* Rien a rattacher et rien a completer : le groupe n'a plus lieu d'etre
       montre. Le garder ferait annoncer indefiniment un travail qui n'existe
       plus — c'est ce qui est arrive avec les 518 fiches deja remises. */
    if (dejaUneSeulePersonne && !apport.length) continue;

    resultat.push({
      garder, absorber, apport, conflits, noms_differents, partage, preuve,
      deja_une_seule_personne: dejaUneSeulePersonne,
    });
  }

  /* Les groupes qui apportent quelque chose d'abord : ce sont ceux qui
     completent une fiche, donc ceux qui valent la peine d'etre regardes. */
  resultat.sort((a, b) => b.apport.length - a.apport.length || a.garder.id - b.garder.id);
  return resultat;
}

/**
 * Les formations de chaque fiche.
 *
 * C'est la preuve qui manquait pour decider. Le rapprochement se fait sur le
 * nom, et le nom ne distingue pas deux homonymes : on demandait donc de
 * trancher « meme personne ou non ? » sans montrer ce qui permet de repondre.
 * Deux fiches sur deux formations differentes, c'est une personne qui est
 * revenue. Deux fiches sur la meme formation, c'est un doublon d'import — ou
 * deux personnes qui portent le meme nom, et il faut alors regarder de pres.
 *
 * Une seule requete pour tout le panneau : une par fiche en ferait des
 * centaines sur une base un peu fournie.
 */
const MAX_ACTIVITES_AFFICHEES = 8;

async function attacherActivites(groupes) {
  const fiches = groupes.flatMap((g) => [g.garder, ...g.absorber]);
  if (!fiches.length) return;

  const { rows } = await pool.query(
    `SELECT ap.participant_id, a.id, a.title, a.activity_date
       FROM activity_participants ap
       JOIN activities a ON a.id = ap.activity_id
      WHERE ap.participant_id = ANY($1::int[])
      ORDER BY a.activity_date DESC NULLS LAST, a.id DESC`,
    [fiches.map((f) => f.id)]
  );

  const parFiche = new Map();
  for (const r of rows) {
    if (!parFiche.has(r.participant_id)) parFiche.set(r.participant_id, []);
    parFiche.get(r.participant_id).push({ id: r.id, titre: r.title, date: r.activity_date });
  }

  for (const f of fiches) {
    const liste = parFiche.get(f.id) || [];
    f.activites = liste.slice(0, MAX_ACTIVITES_AFFICHEES);
    /* Le total sert a dire « et 3 autres » plutot que de tout deverser. */
    f.activites_total = liste.length;
  }

  /* Deux fiches inscrites a la meme formation ne s'expliquent pas par une
     personne revenue : c'est soit un doublon d'import, soit deux homonymes.
     Dans les deux cas, la ligne merite d'etre regardee avant d'etre validee. */
  for (const g of groupes) {
    const vues = new Set();
    g.activite_partagee = false;
    for (const f of [g.garder, ...g.absorber]) {
      for (const a of parFiche.get(f.id) || []) {
        if (vues.has(a.id)) { g.activite_partagee = true; break; }
        vues.add(a.id);
      }
      if (g.activite_partagee) break;
    }
  }
}

router.get("/fiches-doublons", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone,
              p.genre, p.age_range, p.statut, p.structure, p.personne_id ${baseFrom}
       ORDER BY p.id`,
      params
    );

    const groupes = analyserGroupes(r.rows, await paresDistinctes());
    await attacherActivites(groupes);
    res.json({
      /* Le nombre de fiches en trop, pas le nombre de groupes : c'est ce qui
         disparaitra des listes et des compteurs. */
      total: groupes.reduce((n, g) => n + g.absorber.length, 0),
      personnes: groupes.length,
      a_completer: groupes.filter((g) => g.apport.length > 0).length,
      avec_conflit: groupes.filter((g) => g.conflits.length > 0).length,
      /* Les groupes reconnus par l'adresse ou le numero, dont les noms sont
         ecrits differemment d'une fiche a l'autre : ce sont ceux que la
         detection par le nom seul manquait, et ceux qu'il faut regarder de
         plus pres avant de les valider. */
      reconnus_par_contact: groupes.filter((g) => g.noms_differents).length,
      /* Les groupes ou deux fiches figurent sur la meme formation : ceux-la
         ne s'expliquent pas par une personne revenue. */
      avec_activite_partagee: groupes.filter((g) => g.activite_partagee).length,
      /* Ce que le bandeau annonce : les groupes qui partent decoches, quelle
         que soit la raison. Additionner les compteurs precedents surestimerait
         un groupe qui cumule plusieurs motifs ; en prendre le plus grand le
         sous-estimerait des qu'ils portent sur des groupes differents — ce qui
         est le cas courant. */
      a_regarder: groupes.filter(
        (g) => g.conflits.length > 0 || g.activite_partagee || g.noms_differents
      ).length,
      groupes,
    });
  } catch (err) {
    console.error("[FICHES DOUBLONS]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== COMPLETER LES FICHES D'UNE MEME PERSONNE =====
 *
 * Une version precedente reunissait les fiches : elle transferait les
 * presences puis supprimait la fiche absorbee. C'etait une erreur de
 * conception, et elle s'est vue sur le terrain — le nombre de beneficiaires de
 * certaines activites a baisse.
 *
 * Le mecanisme : quand deux fiches d'une meme personne figuraient sur la meme
 * activite, la fusion n'en laissait qu'une ligne. Le compte de cette activite
 * perdait une unite. Et si le rapprochement etait faux — deux homonymes — un
 * vrai beneficiaire disparaissait d'une liste de presence.
 *
 * Le but n'a jamais ete de supprimer qui que ce soit. Il etait de completer :
 * une personne laisse son adresse sur une liste et son telephone sur une
 * autre ; chaque liste doit porter l'information complete.
 *
 * On ne supprime donc plus rien, et on ne deplace aucune presence. On remplit
 * les cases vides de CHAQUE fiche du groupe avec ce que les autres portent.
 * Les listes de presence gardent exactement les memes lignes ; seules les
 * cases vides se remplissent. Les comptes ne peuvent pas bouger.
 */
/* ===== LES RATTACHEMENTS DE FICHES, ET LE MOYEN DE LES DEFAIRE =====
 *
 * Rattacher ne supprime rien : c'est ce qui permet de revenir en arriere sans
 * perte. Encore faut-il pouvoir le faire, et voir ce qui a ete rattache — un
 * geste reversible dont personne ne connait le chemin du retour n'est pas
 * reversible.
 */
/* ===== LA REVUE, GROUPE PAR GROUPE =====
 *
 * Les groupes qu'une adresse ou un numero prouve sont rattaches d'un bloc.
 * Restent ceux qui ne tiennent qu'au nom : la plateforme refuse de trancher a
 * la place de quelqu'un, et c'est juste — mais refuser de trancher sans donner
 * de quoi le faire revient a ne rien proposer du tout. Plusieurs centaines de
 * decisions qu'on ne peut pas prendre ne valent pas mieux que zero.
 *
 * Cette route sert donc un groupe a la fois, avec ce qui permet de decider :
 * ce qui decrit la personne — genre, tranche d'age, structure — et les
 * activites de chaque fiche. Ces dernieres pesent lourd : deux fiches sur la
 * MEME formation sont le cas le plus probable d'homonymes, tandis que deux
 * formations differentes decrivent quelqu'un qui est revenu.
 */
router.get("/fiches-doublons/revue", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const { baseFrom, params } = buildFilters(req);
    const r = await pool.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone,
              p.genre, p.age_range, p.statut, p.structure, p.personne_id ${baseFrom}
       ORDER BY p.id`,
      params
    );

    const tous = analyserGroupes(r.rows, await paresDistinctes());
    /* Seuls ceux qui attendent une decision humaine. Les autres sont traites
       par le bouton de la page, sans qu'on ait a les regarder. */
    const aRevoir = tous.filter((g) => g.preuve === "nom_seul");

    /* Les plus renseignes d'abord : ce sont ceux qu'on peut trancher, et
       commencer par des cas decidables evite de se decourager sur une file
       de fiches muettes. */
    const renseignement = (g) => [g.garder, ...g.absorber]
      .reduce((n, f) => n + CHAMPS_FICHE.filter((c) => valeurNormalisee(c, f[c]) !== null).length, 0);
    aRevoir.sort((a, b) => renseignement(b) - renseignement(a) || a.garder.id - b.garder.id);

    const position = Math.max(0, parseInt(req.query.position, 10) || 0);
    const groupe = aRevoir[position] || null;
    if (groupe) await attacherActivites([groupe]);

    res.json({
      total: aRevoir.length,
      position,
      /* Ce qui ne demande aucune decision : le dire evite de croire que la
         file represente tout le travail. */
      traites_automatiquement: tous.length - aRevoir.length,
      groupe: groupe && {
        fiches: [groupe.garder, ...groupe.absorber],
        conflits: groupe.conflits,
        noms_differents: groupe.noms_differents,
        /* Deux fiches sur une meme activite : le signe le plus fort
           d'homonymie, et celui qu'il faut voir en premier. */
        activite_partagee: (() => {
          const vues = new Set();
          for (const f of [groupe.garder, ...groupe.absorber]) {
            for (const a of f.activites || []) {
              if (vues.has(a.id)) return true;
              vues.add(a.id);
            }
          }
          return false;
        })(),
      },
    });
  } catch (err) {
    console.error("[FICHES DOUBLONS REVUE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* La decision prise sur un groupe.
 *
 * Trois issues, pas deux. « Je ne sais pas » compte autant que les autres :
 * forcer un choix binaire sur des fiches qui ne portent rien produit des
 * decisions au hasard, c'est-a-dire exactement ce qu'on cherche a eviter. On
 * passe, et le groupe restera propose.
 */
router.post("/fiches-doublons/decision", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const ids = Array.isArray(req.body?.fiches)
      ? [...new Set(req.body.fiches.map(Number).filter(Number.isInteger))] : [];
    const decision = String(req.body?.decision || "");
    if (ids.length < 2) return res.status(400).json({ error: "Il faut au moins deux fiches." });
    if (!["meme_personne", "deux_personnes"].includes(decision)) {
      return res.status(400).json({ error: "Décision inconnue." });
    }

    /* Le perimetre s'applique : on ne decide pas sur des fiches qu'on n'a pas
       le droit de voir. */
    const { baseFrom, params } = buildFilters(req);
    const { rows: visibles } = await client.query(
      `SELECT DISTINCT p.id ${baseFrom}`, params
    );
    const permis = new Set(visibles.map((v) => v.id));
    if (!ids.every((i) => permis.has(i))) {
      return res.status(403).json({ error: "Certaines de ces fiches ne vous sont pas accessibles." });
    }

    const auteur = await client.query("SELECT full_name FROM users WHERE id = $1", [req.user.id]);
    const nomAuteur = auteur.rows[0]?.full_name || null;

    await client.query("BEGIN");
    ouverte = true;

    if (decision === "meme_personne") {
      const { deplacees } = await reunir(client, ids);
      await client.query("COMMIT");
      ouverte = false;

      for (const dep of deplacees) {
        await logAudit(req, "UPDATE", "participants", String(dep.fiche), null, {
          motif: "fiches de la même personne, rattachées",
          suppression: false,
          identite_avant: dep.avant,
          rattachee_avec: ids[0],
          reconnue_par: "décision à la revue",
        });
      }
      return res.json({ decision, rattachees: deplacees.length });
    }

    /* « Deux personnes » : on enregistre chaque paire du groupe. Une paire
       plutot qu'un groupe, parce que les groupes se recalculent a chaque
       affichage et qu'une decision attachee a l'un ne survivrait pas au
       suivant. */
    let paires = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
        const r = await client.query(
          `INSERT INTO identites_distinctes (fiche_a, fiche_b, decide_par, decide_par_nom)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [a, b, req.user.id, nomAuteur]
        );
        paires += r.rowCount;
      }
    }

    await client.query("COMMIT");
    ouverte = false;

    await logAudit(req, "CREATE", "identites_distinctes", null,
      `${ids.length} fiches déclarées distinctes`, {
        motif: "ces fiches ne désignent pas la même personne",
        fiches: ids, paires,
      });

    res.json({ decision, paires });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[FICHES DOUBLONS DECISION]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* Revenir sur un « deux personnes » : on retire la paire, le groupe
   redevient proposable. Se tromper ne doit pas etre definitif. */
router.post("/fiches-doublons/decision/annuler", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });
    const ids = Array.isArray(req.body?.fiches)
      ? [...new Set(req.body.fiches.map(Number).filter(Number.isInteger))] : [];
    if (ids.length < 2) return res.status(400).json({ error: "Il faut au moins deux fiches." });

    const { rowCount } = await pool.query(
      `DELETE FROM identites_distinctes
        WHERE fiche_a = ANY($1::int[]) AND fiche_b = ANY($1::int[])`,
      [ids]
    );
    await logAudit(req, "DELETE", "identites_distinctes", null,
      `${rowCount} décision(s) annulée(s)`, { fiches: ids });
    res.json({ annulees: rowCount });
  } catch (err) {
    console.error("[FICHES DOUBLONS DECISION ANNULER]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.get("/fiches-rattachees", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const LIMITE = 1000;
    const { rows } = await pool.query(
      `SELECT id, resource_id, resource_label, details, created_at
         FROM audit_logs
        WHERE resource = 'participants' AND action = 'UPDATE'
          AND details->>'identite_avant' IS NOT NULL
        ORDER BY created_at DESC, id DESC
        LIMIT $1`,
      [LIMITE]
    );

    const lignes = [];
    for (const l of rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      const fiche = Number(l.resource_id);
      const avant = Number(d.identite_avant);
      if (!Number.isInteger(fiche) || !Number.isInteger(avant)) continue;
      lignes.push({
        journal: String(l.id),
        fiche, identite_avant: avant,
        nom: l.resource_label,
        rattachee_avec: d.rattachee_avec ?? null,
        reconnue_par: d.reconnue_par ?? null,
        rattachee_le: l.created_at,
      });
    }

    /* Deja defait ? La fiche porte de nouveau l'identite d'avant. On le lit
       dans la base, pas dans le journal. */
    if (lignes.length) {
      const { rows: actuelles } = await pool.query(
        "SELECT id, personne_id FROM participants WHERE id = ANY($1::int[])",
        [lignes.map((l) => l.fiche)]
      );
      const identite = new Map(actuelles.map((r) => [r.id, r.personne_id]));
      for (const l of lignes) l.defaite = identite.get(l.fiche) === l.identite_avant;
    }

    res.json({
      total: lignes.length,
      a_defaire: lignes.filter((l) => !l.defaite).length,
      lignes,
    });
  } catch (err) {
    console.error("[FICHES RATTACHEES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/fiches-rattachees/separer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const journaux = Array.isArray(req.body?.journaux)
      ? req.body.journaux.map(Number).filter(Number.isInteger) : [];
    if (!journaux.length) return res.status(400).json({ error: "Aucun rattachement à défaire." });

    const { rows } = await client.query(
      `SELECT id, resource_id, details FROM audit_logs
        WHERE id = ANY($1::int[]) AND resource = 'participants' AND action = 'UPDATE'
          AND details->>'identite_avant' IS NOT NULL`,
      [journaux]
    );

    await client.query("BEGIN");
    ouverte = true;

    let defaites = 0;
    let dejaFaites = 0;
    for (const l of rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      const remises = await defaire(client, [
        { fiche: Number(l.resource_id), avant: Number(d.identite_avant) },
      ]);
      if (remises) defaites += 1;
      else dejaFaites += 1;
    }

    await client.query("COMMIT");
    ouverte = false;

    logAudit(req, "UPDATE", "participants", null, `${defaites} rattachement(s) défait(s)`, {
      motif: "rattachement défait",
      fiches: rows.map((l) => Number(l.resource_id)),
    });

    res.json({ defaites, deja_faites: dejaFaites });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[FICHES RATTACHEES SEPARER]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

router.post("/fiches-doublons/completer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "Aucun groupe à compléter." });
    if (ids.length > 1000) return res.status(400).json({ error: "Trop de fiches en une fois." });

    const { baseFrom, params } = buildFilters(req);
    const portee = await client.query(
      `SELECT DISTINCT p.id, p.nom, p.prenom, p.email, p.telephone,
              p.genre, p.age_range, p.statut, p.structure, p.personne_id ${baseFrom} ORDER BY p.id`,
      params
    );

    /* Les groupes se recalculent sur l'etat courant. L'appelant designe les
       fiches du groupe ; on complete le groupe entier, pas une fiche isolee. */
    const demandes = new Set(ids);
    const groupesRetenus = analyserGroupes(portee.rows, await paresDistinctes()).filter((g) =>
      g.absorber.some((f) => demandes.has(f.id)) || demandes.has(g.garder.id)
    );

    await client.query("BEGIN");
    ouverte = true;

    let fichesCompletees = 0;
    let champsRemplis = 0;
    let rattachees = 0;
    let laisseesSurNomSeul = 0;
    const detail = [];
    const rapprochements = [];

    for (const groupe of groupesRetenus) {
      const membres = [groupe.garder, ...groupe.absorber];

      /* ── Rattacher, en plus de completer ──────────────────────────────
         Completer remplit les cases vides ; cela ne dit toujours pas que ces
         fiches designent une seule personne. Le compte continuait donc
         d'annoncer deux beneficiaires pour quelqu'un qui n'est venu qu'une
         fois, et rien ne pouvait le corriger sans supprimer.

         Depuis que l'identite existe, le rattachement suffit : la ligne de
         liste de presence reste, le compte des personnes se corrige, et on
         peut revenir en arriere.

         Comme partout, le nom seul ne decide pas. Les groupes adosses a une
         adresse ou un numero partage sont rattaches ; les autres sont
         completes mais laisses tels quels, et comptes a part. */
      if (groupe.preuve === "contact") {
        const { deplacees } = await reunir(client, membres.map((f) => f.id));
        for (const dep of deplacees) {
          rattachees += 1;
          const f = membres.find((m) => m.id === dep.fiche);
          rapprochements.push({
            fiche: dep.fiche,
            avant: dep.avant,
            nom: f ? `${f.prenom || ""} ${f.nom || ""}`.trim() : null,
            avec: groupe.garder.id,
            preuve: groupe.partage.map((p) => p.libelle).join(" et "),
          });
        }
      } else {
        laisseesSurNomSeul += 1;
      }

      /* La valeur retenue pour chaque champ : la seule connue du groupe. S'il
         y en a plusieurs qui different, on ne tranche pas — un desaccord se
         regarde, il ne se resout pas par une regle. La ligne est de toute
         facon decochee par defaut dans l'interface. */
      const valeurs = {};
      for (const champ of CHAMPS_FICHE) {
        const connues = new Map();
        for (const f of membres) {
          const n = valeurNormalisee(champ, f[champ]);
          if (n !== null && !connues.has(n)) connues.set(n, String(f[champ]).trim());
        }
        if (connues.size === 1) valeurs[champ] = [...connues.values()][0];
      }

      const aEcrire = Object.keys(valeurs);
      if (!aEcrire.length) continue;

      for (const f of membres) {
        /* Seules les cases vides se remplissent : COALESCE n'ecrase rien de
           renseigne. Une fiche deja complete n'est pas touchee. */
        const manquants = aEcrire.filter((c) => valeurNormalisee(c, f[c]) === null);
        if (!manquants.length) continue;

        await client.query(
          `UPDATE participants SET ${manquants.map((c, i) => `${c} = COALESCE(${c}, $${i + 2})`).join(", ")}
            WHERE id = $1`,
          [f.id, ...manquants.map((c) => valeurs[c])]
        );
        fichesCompletees += 1;
        champsRemplis += manquants.length;
        detail.push({ fiche: f.id, nom: `${f.prenom} ${f.nom}`, champs: manquants });
      }
    }

    await client.query("COMMIT");
    ouverte = false;

    if (detail.length) {
      logAudit(req, "UPDATE", "participants", null,
        `${fichesCompletees} fiche(s) complétée(s)`, { champs_remplis: champsRemplis, detail });
    }

    /* Une trace par fiche rattachee, portant l'identite d'avant : c'est elle
       qui rend le retour exact. Une trace par groupe ne suffirait pas — on
       veut pouvoir defaire une fiche sans defaire ses voisines. */
    for (const r of rapprochements) {
      await logAudit(
        req, "UPDATE", "participants", String(r.fiche),
        r.nom || `fiche ${r.fiche}`,
        {
          motif: "fiches de la même personne, rattachées",
          suppression: false,
          identite_avant: r.avant,
          rattachee_avec: r.avec,
          reconnue_par: r.preuve || null,
        }
      );
    }

    res.json({
      fiches_completees: fichesCompletees,
      champs_remplis: champsRemplis,
      groupes: groupesRetenus.length,
      /* Ce que le rattachement a corrige, et ce qu'il a laisse. Taire le
         second ferait croire le travail fini. */
      fiches_rattachees: rattachees,
      groupes_sur_nom_seul: laisseesSurNomSeul,
    });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[FICHES DOUBLONS COMPLETION]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* ===== DEUX FOIS LA MEME PERSONNE SUR UNE MEME ACTIVITE =====
 *
 * L'import ne fabrique plus ces doublons. Restent ceux d'avant : sur une meme
 * liste de presence, la meme personne compte pour deux beneficiaires. Le
 * chiffre de l'activite est faux, et elle recevra deux fois son attestation.
 *
 * Ce qu'on retire n'est PAS une fiche — c'est une inscription en trop : la
 * ligne qui relie la fiche a cette activite-la. Les deux fiches restent, avec
 * toutes leurs autres formations. C'est la difference avec l'ancienne
 * « reunion », qui supprimait la fiche et faisait disparaitre une personne de
 * listes ou elle avait vraiment ete presente.
 *
 * Le retrait est ecrit au journal, et se defait : remettre la ligne, c'est
 * reinserer le lien.
 */

/**
 * Les groupes de fiches inscrites a une meme activite qui designent la meme
 * personne.
 *
 * Trois rapprochements, dans l'ordre de leur solidite :
 *  - la meme identite (les mots du nom et du prenom, tries) : sur une seule
 *    activite, c'est un doublon, pas une personne revenue ;
 *  - la meme adresse ou le meme numero, avec un nom compatible — « Awa Diop »
 *    et « Awa Marie Diop » ;
 *  - pour les fiches a l'identite incomplete (« Diop » sans prenom), les memes
 *    mots, a condition que rien ne les separe.
 */
function doublonsSurActivite(lignes) {
  /* Sur tout le lot : c'est le nombre de personnes que le contact accompagne
     dans la base qui dit s'il est collectif, pas ce qu'on en voit sur une
     activite. Les lignes portent une fiche par inscription, donc la meme
     fiche plusieurs fois ; on ne la compte qu'une. */
  const fichesUniques = [...new Map(lignes.map((l) => [l.id, l])).values()];
  const collectifsIci = contactsCollectifs(fichesUniques);

  const parActivite = new Map();
  for (const l of lignes) {
    if (!parActivite.has(l.activite_id)) {
      parActivite.set(l.activite_id, {
        activite_id: l.activite_id, titre: l.titre, date: l.date, fiches: new Map(),
      });
    }
    parActivite.get(l.activite_id).fiches.set(l.id, l);
  }

  const groupes = [];
  for (const act of parActivite.values()) {
    const fiches = [...act.fiches.values()];
    if (fiches.length < 2) continue;

    const parents = new Map(fiches.map((f) => [f.id, f.id]));



    /* Identites strictement identiques — mais pas contredites.

       Le meme nom ecrit deux fois ne suffisait pas : il reunissait sans rien
       verifier. Un enfant et un adulte qui portent le meme nom se
       retrouvaient donc confondus, et sur les listes d'ateliers pour enfants,
       ou ni adresse ni numero ne sont demandes, rien ne pouvait les separer.
       On consulte les memes regles que partout ailleurs : une adresse ou un
       numero qui different, un genre ou une tranche d'age incompatibles,
       et ce sont deux personnes. */
    const parCle = new Map();
    for (const f of fiches) {
      const cle = clePersonne(f.nom, f.prenom);
      if (!cle) continue;
      const deja = parCle.get(cle);
      if (deja === undefined) { parCle.set(cle, f.id); continue; }
      if (rienNeSepare(act.fiches.get(deja), f)) unir(parents, deja, f.id);
    }

    /* Meme contact et nom compatible. */
    unirParContact(parents, fiches);

    /* Identites incompletes : les memes mots, et rien qui les separe. */
    const parApprochee = new Map();
    for (const f of fiches) {
      if (clePersonne(f.nom, f.prenom)) continue;
      const cle = cleApprochee(f.nom, f.prenom);
      if (!cle) continue;
      if (!parApprochee.has(cle)) parApprochee.set(cle, []);
      parApprochee.get(cle).push(f);
    }
    for (const memesMots of parApprochee.values()) {
      for (let i = 0; i < memesMots.length; i++) {
        for (let j = i + 1; j < memesMots.length; j++) {
          if (rienNeSepare(memesMots[i], memesMots[j])) {
            unir(parents, memesMots[i].id, memesMots[j].id);
          }
        }
      }
    }

    const parGroupe = new Map();
    for (const f of fiches) {
      const r = racine(parents, f.id);
      if (!parGroupe.has(r)) parGroupe.set(r, []);
      parGroupe.get(r).push(f);
    }

    for (const membres of parGroupe.values()) {
      if (membres.length < 2) continue;

      /* Deja rapprochees : ces fiches designent la meme personne, le travail
         est fait. Sans ce garde-fou le groupe restait propose apres coup, et
         on pouvait le « nettoyer » indefiniment sans que rien ne change —
         l'ecran annoncant a chaque fois des doublons a traiter. */
      const identites = new Set(membres.map((f) => f.personne_id).filter(Boolean));
      if (identites.size === 1 && membres.every((f) => f.personne_id)) continue;

      /* La fiche conservee est la mieux renseignee — celle dont on perd le
         moins en retirant les autres inscriptions. A egalite, celle qui figure
         sur le plus d'autres formations : son identifiant circule deja. Puis la
         plus ancienne. */
      const ordre = [...membres].sort(
        (a, b) => renseignes(b) - renseignes(a)
          || (b.total_activites || 0) - (a.total_activites || 0)
          || a.id - b.id
      );
      const garder = ordre[0];
      const retirer = ordre.slice(1);

      const cles = new Set(membres.map((f) => clePersonne(f.nom, f.prenom)));
      const nomsIdentiques = cles.size === 1 && !cles.has(null);

      /* Sur quoi le rapprochement repose vraiment.

         Une adresse ou un numero partage designe une personne : deux fiches
         qui en portent le meme sont la meme, et le rapprochement se fait sans
         arbitrage. Le nom, non. « Seynabou Ndiaye » peut etre deux femmes sur
         une liste de trois cents, et sur les listes d'ateliers pour enfants —
         ou ni adresse ni numero ne sont demandes — c'est le cas ordinaire,
         pas l'exception.

         Le nettoyage de septembre a retire 929 inscriptions dont 53 % ne
         reposaient que sur le nom. Ces rapprochements-la ne s'appliquent plus
         en masse : ils se proposent, et quelqu'un tranche. */
      const partageUnContact = (() => {
        const mails = new Set(membres.map((f) => mailCompare(f.email)).filter(Boolean));
        const tels = new Set(membres.map((f) => telCompare(f.telephone)).filter(Boolean));
        const avecMail = membres.filter((f) => mailCompare(f.email)).length;
        const avecTel = membres.filter((f) => telCompare(f.telephone)).length;
        /* Un contact collectif ne prouve rien : vingt enfants portent le
           telephone de leur directeur d'ecole. */
        const mailPropre = mails.size === 1 && !collectifsIci.mails.has([...mails][0]);
        const telPropre = tels.size === 1 && !collectifsIci.tels.has([...tels][0]);
        return (mailPropre && avecMail === membres.length)
          || (telPropre && avecTel === membres.length);
      })();

      const preuve = partageUnContact ? "contact" : "nom_seul";
      /* « Certain » veut dire : applicable sans que personne ne tranche. Le
         nom identique n'y suffit plus. */
      const certain = partageUnContact;

      groupes.push({
        cle: `${act.activite_id}:${garder.id}`,
        activite: { id: act.activite_id, titre: act.titre, date: act.date },
        certain,
        preuve,
        noms_identiques: nomsIdentiques,
        motif: nomsIdentiques
          ? "identite_identique"
          : membres.every((f) => clePersonne(f.nom, f.prenom))
            ? "nom_plus_complet"
            : "identite_incomplete",
        garder,
        retirer,
      });
    }
  }

  /* Les cas surs d'abord : ce sont ceux qu'on traite sans hesiter. */
  groupes.sort(
    (a, b) => Number(b.certain) - Number(a.certain)
      || a.activite.id - b.activite.id
      || a.garder.id - b.garder.id
  );
  return groupes;
}

const MAX_GROUPES_DOUBLONS = 300;

/* Les fiches lues dans le perimetre de l'utilisateur, avec l'activite de
   chaque inscription et le nombre total de formations de la fiche. */
async function lignesInscrites(req) {
  const { baseFrom, params } = buildFilters(req);
  const { rows } = await pool.query(
    `SELECT DISTINCT ap.activity_id AS activite_id, a.title AS titre,
            to_char(a.activity_date, 'YYYY-MM-DD') AS date,
            p.id, p.nom, p.prenom, p.email, p.telephone,
            p.genre, p.age_range, p.statut, p.structure,
            /* L'identite a laquelle la fiche est rattachee : deux fiches qui
               la partagent sont deja reconnues comme une seule personne, et
               n'ont plus rien a se voir proposer. */
            p.personne_id,
            (SELECT COUNT(*) FROM activity_participants x WHERE x.participant_id = p.id)
              ::int AS total_activites
       ${baseFrom}
      ORDER BY ap.activity_id, p.id`,
    params
  );
  return rows;
}

router.get("/doublons-activite", authMiddleware, async (req, res) => {
  try {
    if (req.user.role === "viewer") return res.status(403).json({ error: "Accès refusé" });

    const groupes = doublonsSurActivite(await lignesInscrites(req));
    res.json({
      /* Le nombre d'inscriptions en trop : c'est exactement ce que les
         effectifs comptent en double. */
      total: groupes.reduce((n, g) => n + g.retirer.length, 0),
      groupes_total: groupes.length,
      /* « Certain » : adosse a une adresse ou un numero partage. Ceux-la
         s'appliquent d'un bloc. Les autres ne reposent que sur le nom et
         attendent une decision — ils ne partent jamais en masse. */
      certains: groupes.filter((g) => g.certain).length,
      a_regarder: groupes.filter((g) => !g.certain).length,
      sur_nom_seul: groupes.filter((g) => g.preuve === "nom_seul").length,
      activites: new Set(groupes.map((g) => g.activite.id)).size,
      tronquee: groupes.length > MAX_GROUPES_DOUBLONS,
      groupes: groupes.slice(0, MAX_GROUPES_DOUBLONS),
    });
  } catch (err) {
    console.error("[DOUBLONS ACTIVITE]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Retirer les inscriptions en trop.
 *
 * L'appelant ne designe pas les lignes a supprimer : il designe des groupes, et
 * le serveur recalcule lesquelles sont en trop. Accepter une liste de couples
 * (activite, fiche) donnerait a cet ecran le pouvoir de vider n'importe quelle
 * liste de presence, et agirait sur un etat peut-etre perime. */
router.post("/doublons-activite/retirer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const tout = req.body?.tout === true;
    const demandes = new Set(
      Array.isArray(req.body?.groupes) ? req.body.groupes.map(String) : []
    );
    if (!tout && !demandes.size) {
      return res.status(400).json({ error: "Aucun doublon sélectionné." });
    }

    const tous = doublonsSurActivite(await lignesInscrites(req));

    /* « Tout » ne veut pas dire « tout ce qui se ressemble ».

       Un rapprochement adosse a une adresse ou un numero partage designe une
       personne : il s'applique sans que personne n'ait a trancher. Un
       rapprochement qui ne repose que sur le nom, non — et c'etait plus de la
       moitie des 929 retraits de septembre. Celui-la ne part jamais en masse :
       il faut le designer, groupe par groupe, apres l'avoir regarde.

       Rien n'est interdit. On demande seulement de le dire. */
    const surNomSeul = tous.filter((g) => !g.certain);
    const retenus = tout
      ? tous.filter((g) => g.certain)
      : tous.filter((g) => demandes.has(g.cle));

    if (!retenus.length) {
      return res.json({
        retirees: 0, groupes: 0, activites: 0, deja_faites: 0,
        /* On dit ce qui a ete laisse de cote, sinon « 0 rapprochement » se
           lit comme « il n'y avait rien a faire ». */
        laisses_sur_nom_seul: tout ? surNomSeul.length : 0,
      });
    }

    await client.query("BEGIN");
    ouverte = true;

    let retirees = 0;
    let dejaFaites = 0;
    const activitesTouchees = new Set();
    const traces = [];

    /* On ne supprime plus l'inscription : on rattache la fiche a la meme
       personne que celle qu'on garde.

       La ligne de liste de presence reste — c'est un document, on ne reecrit
       pas une feuille d'emargement signee. Le compte des personnes distinctes
       baisse, celui des lignes ne bouge pas, et si le rapprochement etait
       faux, personne n'a disparu d'une liste ou il figurait : il suffit de
       separer a nouveau.

       C'est la difference avec le nettoyage de septembre, qui a retire 929
       inscriptions dont plus de la moitie sur le seul nom. */
    for (const g of retenus) {
      const aRattacher = [];
      for (const f of g.retirer) {
        const { rows } = await client.query(
          `SELECT p.personne_id
             FROM participants p
             JOIN activity_participants ap ON ap.participant_id = p.id
            WHERE p.id = $1 AND ap.activity_id = $2`,
          [f.id, g.activite.id]
        );
        /* Plus inscrite, ou deja rattachee a la meme personne : rien a faire. */
        const garde = await client.query(
          "SELECT personne_id FROM participants WHERE id = $1", [g.garder.id]
        );
        if (!rows.length || (rows[0].personne_id && rows[0].personne_id === garde.rows[0]?.personne_id)) {
          dejaFaites += 1;
          continue;
        }
        aRattacher.push(f);
      }

      if (!aRattacher.length) continue;

      const { deplacees } = await reunir(
        client, [g.garder.id, ...aRattacher.map((f) => f.id)]
      );
      const parFiche = new Map(deplacees.map((d) => [d.fiche, d.avant]));
      for (const f of aRattacher) {
        if (!parFiche.has(f.id)) { dejaFaites += 1; continue; }
        retirees += 1;
        activitesTouchees.add(g.activite.id);
        traces.push({ groupe: g, fiche: f, identiteAvant: parFiche.get(f.id) });
      }
    }

    await client.query("COMMIT");
    ouverte = false;

    /* Une trace par rapprochement : c'est elle qui permet de le defaire.
       Elle porte l'identite d'avant, ce qui rend le retour exact — la fiche
       retrouve celle qu'elle avait, pas une equivalente.

       L'action reste « DELETE » sur « activity_participants » : c'est ce que
       l'ecran « Inscriptions retirees » interroge, et les traces d'avant, qui
       supprimaient vraiment, doivent continuer de s'y lire. Le motif dit
       laquelle des deux operations a eu lieu. */
    for (const { groupe, fiche, identiteAvant } of traces) {
      await logAudit(
        req, "DELETE", "activity_participants", `${groupe.activite.id}:${fiche.id}`,
        `${fiche.prenom || ""} ${fiche.nom || ""}`.trim() || `fiche ${fiche.id}`,
        {
          motif: "doublon sur la même activité : fiche rattachée à la même personne",
          /* Rien n'a ete supprime : la ligne de presence est toujours la. */
          suppression: false,
          identite_avant: identiteAvant ?? null,
          doublon_de: groupe.garder.id,
          rapprochement: groupe.motif,
          activite_id: groupe.activite.id,
          activite: groupe.activite.titre,
          participant_id: fiche.id,
          fiche: {
            nom: fiche.nom || "", prenom: fiche.prenom || "",
            email: fiche.email || null, telephone: fiche.telephone || null,
          },
        }
      );
    }

    /* Les effectifs ont bouge : le score de fiabilite de ces activites se
       recalcule, sinon il resterait celui d'avant. */
    for (const id of activitesTouchees) {
      await computeAndStoreReliability(id).catch((e) =>
        console.warn("[DOUBLONS ACTIVITE] fiabilité:", e.message)
      );
    }

    res.json({
      retirees,
      groupes: retenus.length,
      activites: activitesTouchees.size,
      deja_faites: dejaFaites,
      /* Ce qui reste a regarder a la main. Le taire ferait croire le travail
         fini alors que la moitie attend une decision. */
      laisses_sur_nom_seul: tout ? surNomSeul.length : 0,
    });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[DOUBLONS ACTIVITE RETRAIT]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* Les inscriptions retirees, et le moyen de les remettre.
   Remettre une inscription est sans danger : c'est reinserer un lien, et
   l'operation ne peut pas se produire deux fois — le lien existe ou non. */
router.get("/inscriptions-retirees", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    /* Deux plafonds, et ils ne servent pas a la meme chose.
     *
     * L'ecran n'affiche qu'une page de lignes — au-dela, la liste devient
     * illisible et le navigateur peine. Mais le decompte, lui, doit porter
     * sur tout le journal : un seul plafond a 500 avait un effet qu'on n'a
     * vu qu'apres coup. Le journal comptait 929 retraits ; les 500 les plus
     * recents s'arretaient a 12h17, et les 429 d'avant — dont les 173 de
     * « AASTIC - Journee Scientifique » — n'apparaissaient nulle part. Le
     * bouton « tout remettre » ne remettait que ce que l'ecran avait charge,
     * et l'activite restait a 1655 quel que soit le nombre de clics.
     *
     * On lit donc large, on affiche une page, et on compte sur l'ensemble. */
    const LIMITE_LECTURE = 20000;
    const LIMITE_AFFICHEE = 500;
    const total = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE resource = 'activity_participants' AND action = 'DELETE'`
    );
    const r = await pool.query(
      `SELECT id, resource_label, details, created_at FROM audit_logs
        WHERE resource = 'activity_participants' AND action = 'DELETE'
        ORDER BY created_at DESC LIMIT $1`,
      [LIMITE_LECTURE]
    );

    const lignes = [];
    for (const l of r.rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      if (!d.activite_id || !d.participant_id) continue;
      lignes.push({
        journal: l.id,
        retiree_le: l.created_at,
        nom: l.resource_label,
        activite_id: Number(d.activite_id),
        activite: d.activite || `Activité ${d.activite_id}`,
        participant_id: Number(d.participant_id),
        doublon_de: d.doublon_de ?? null,
        fiche: d.fiche || null,
        /* Deux formes de traces coexistent. Les anciennes supprimaient
           l'inscription ; les nouvelles rattachent la fiche a une autre
           personne sans rien supprimer. Elles ne se defont pas de la meme
           facon, et surtout ne se lisent pas de la meme facon. */
        suppression: d.suppression !== false,
        identite_avant: Number.isInteger(Number(d.identite_avant)) ? Number(d.identite_avant) : null,
      });
    }

    /* Deja remise ? On le lit dans la base, pas dans le journal.

       Pour une suppression d'autrefois : la ligne existe ou elle n'existe
       pas. Pour un rattachement : la ligne n'est jamais partie, et la lire
       conclurait toujours « deja remise » — ce qui rendrait les
       rapprochements indefaisables. C'est l'identite de la fiche qu'il faut
       regarder : elle a repris celle d'avant, ou elle porte encore celle de
       la personne a laquelle on l'a rattachee. */
    const suppressions = lignes.filter((l) => l.suppression);
    if (suppressions.length) {
      const { rows: presentes } = await pool.query(
        `SELECT activity_id, participant_id FROM activity_participants
          WHERE (activity_id, participant_id) IN (
            SELECT unnest($1::int[]), unnest($2::int[])
          )`,
        [suppressions.map((l) => l.activite_id), suppressions.map((l) => l.participant_id)]
      );
      const vues = new Set(presentes.map((p) => `${p.activity_id}:${p.participant_id}`));
      for (const l of suppressions) {
        l.retablie = vues.has(`${l.activite_id}:${l.participant_id}`);
      }
    }

    const rattachements = lignes.filter((l) => !l.suppression);
    if (rattachements.length) {
      const { rows: actuelles } = await pool.query(
        "SELECT id, personne_id FROM participants WHERE id = ANY($1::int[])",
        [rattachements.map((l) => l.participant_id)]
      );
      const identite = new Map(actuelles.map((r) => [r.id, r.personne_id]));
      for (const l of rattachements) {
        /* Defait : la fiche a retrouve l'identite qu'elle portait avant. */
        l.retablie = l.identite_avant != null
          && identite.get(l.participant_id) === l.identite_avant;
      }
    }

    const aRetablir = lignes.filter((l) => !l.retablie);

    /* Le detail par activite : c'est la question qu'on se pose vraiment. On
       ne lit pas « 429 inscriptions manquent », on lit « la Journee
       Scientifique est a 1655 au lieu de 1828 ». Sans cette ventilation il
       faut derouler des centaines de lignes pour retrouver une activite. */
    const parActivite = new Map();
    for (const l of aRetablir) {
      const e = parActivite.get(l.activite_id)
        || { activite_id: l.activite_id, activite: l.activite, a_retablir: 0 };
      e.a_retablir += 1;
      parActivite.set(l.activite_id, e);
    }

    res.json({
      total: lignes.length,
      a_retablir: aRetablir.length,
      /* « Tronquee » ne parle que de l'affichage : le decompte et le bouton
         « tout remettre » portent sur la totalite du journal. */
      tronquee: aRetablir.length > LIMITE_AFFICHEE,
      total_journal: total.rows[0].n,
      par_activite: [...parActivite.values()].sort((a, b) => b.a_retablir - a.a_retablir),
      /* On n'envoie que ce qui reste a faire : afficher les lignes deja
         remises en place occupait la page avec du travail termine. */
      lignes: aRetablir.slice(0, LIMITE_AFFICHEE),
    });
  } catch (err) {
    console.error("[INSCRIPTIONS RETIREES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/inscriptions-retirees/retablir", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const journaux = Array.isArray(req.body?.journaux)
      ? req.body.journaux.map(Number).filter(Number.isInteger) : [];
    /* « Tout » doit vouloir dire tout le journal, pas tout ce que l'ecran a
       eu la place de charger. C'est cette difference qui laissait 429
       retraits — dont les 173 de la Journee Scientifique — hors d'atteinte :
       le bouton renvoyait la liste affichee, et cette liste s'arretait a la
       500e ligne. Le serveur sait, lui, ce qu'il y a dans le journal.
       Une activite peut aussi etre visee seule : c'est ainsi qu'on repare
       une activite precise sans toucher aux autres. */
    const tout = req.body?.tout === true;
    const surActivite = Number(req.body?.activite_id);
    const cible = Number.isInteger(surActivite) && surActivite > 0 ? surActivite : null;
    if (!journaux.length && !tout && !cible) {
      return res.status(400).json({ error: "Aucune inscription à rétablir." });
    }

    const r = journaux.length
      ? await client.query(
          `SELECT id, details FROM audit_logs
            WHERE id = ANY($1::bigint[])
              AND resource = 'activity_participants' AND action = 'DELETE'`,
          [journaux]
        )
      : await client.query(
          `SELECT id, details FROM audit_logs
            WHERE resource = 'activity_participants' AND action = 'DELETE'
              AND ($1::text IS NULL OR details->>'activite_id' = $1::text)
            ORDER BY created_at ASC`,
          [cible === null ? null : String(cible)]
        );

    await client.query("BEGIN");
    ouverte = true;

    let retablies = 0;
    let impossibles = 0;
    /* Distinct de « impossible » : quand le bouton porte sur tout le journal,
       la plupart des lignes sont deja en place. Les compter comme des echecs
       ferait annoncer « 756 impossibles » apres une remise en place reussie,
       et ferait croire a une panne. */
    let dejaEnPlace = 0;
    const activitesTouchees = new Set();
    const traces = [];
    for (const l of r.rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      const activiteId = Number(d.activite_id);
      const participantId = Number(d.participant_id);
      if (!activiteId || !participantId) continue;

      /* Deux formes de traces coexistent, et il faut savoir les distinguer.

         Les anciennes supprimaient vraiment l'inscription : les remettre,
         c'est reinserer la ligne. Les nouvelles n'ont rien supprime — elles
         ont rattache la fiche a une autre personne —, et la defaire, c'est
         rendre a la fiche l'identite qu'elle portait. Reinserer une ligne qui
         n'est jamais partie ne ferait rien, et l'ecran annoncerait un
         retablissement qui n'a pas eu lieu. */
      if (d.suppression === false) {
        if (!Number.isInteger(Number(d.identite_avant))) { impossibles += 1; continue; }
        const remises = await defaire(client, [
          { fiche: participantId, avant: Number(d.identite_avant) },
        ]);
        /* « defaire » ne touche rien si la fiche porte deja son identite
           d'avant : le rapprochement est donc deja defait. */
        if (!remises) { dejaEnPlace += 1; continue; }
        retablies += 1;
        activitesTouchees.add(activiteId);
        traces.push({ journal: l.id, activiteId, participantId, d });
        continue;
      }

      /* Deja remise ? Il faut le savoir avant d'inserer : « ON CONFLICT DO
         NOTHING » rend la meme chose — zero ligne — que l'activite ou la
         fiche disparue, et on ne saurait pas distinguer un travail deja fait
         d'un echec. */
      const { rowCount: presente } = await client.query(
        "SELECT 1 FROM activity_participants WHERE activity_id = $1 AND participant_id = $2",
        [activiteId, participantId]
      );
      if (presente) { dejaEnPlace += 1; continue; }

      /* L'activite ou la fiche a pu disparaitre depuis : on passe la ligne
         plutot que de faire echouer le reste. */
      const ins = await client.query(
        `INSERT INTO activity_participants (activity_id, participant_id)
         SELECT $1, $2
          WHERE EXISTS (SELECT 1 FROM activities WHERE id = $1)
            AND EXISTS (SELECT 1 FROM participants WHERE id = $2)
         ON CONFLICT DO NOTHING`,
        [activiteId, participantId]
      );
      if (!ins.rowCount) { impossibles += 1; continue; }
      retablies += 1;
      activitesTouchees.add(activiteId);
      traces.push({ journal: l.id, activiteId, participantId, d });
    }

    await client.query("COMMIT");
    ouverte = false;

    for (const t of traces) {
      await logAudit(
        req, "CREATE", "activity_participants", `${t.activiteId}:${t.participantId}`,
        t.d.fiche ? `${t.d.fiche.prenom || ""} ${t.d.fiche.nom || ""}`.trim() : null,
        {
          motif: "inscription remise en place",
          depuis_journal: t.journal,
          activite_id: t.activiteId,
          activite: t.d.activite || null,
          participant_id: t.participantId,
        }
      );
    }

    for (const id of activitesTouchees) {
      await computeAndStoreReliability(id).catch((e) =>
        console.warn("[INSCRIPTIONS RETIREES] fiabilité:", e.message)
      );
    }

    res.json({
      retablies,
      impossibles,
      deja_en_place: dejaEnPlace,
      examinees: r.rows.length,
      activites: activitesTouchees.size,
    });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[INSCRIPTIONS RETIREES RETABLIR]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

/* ===== FICHES SUPPRIMEES PAR L'ANCIENNE REUNION =====
 *
 * L'ancienne version supprimait la fiche absorbee. Le journal d'audit a
 * conserve ce qu'elle portait et les activites auxquelles elle etait inscrite
 * — c'est ce qui rend la remise en place possible.
 *
 * On ne restaure rien d'office : certaines reunions etaient justes, et
 * recreer une vraie ligne en double regonflerait un compte a tort. On montre
 * ce qui a ete supprime, avec ses activites, et l'utilisateur choisit.
 */
router.get("/fiches-absorbees", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    /* Le filtre designe une seule chose : les suppressions ecrites par
       l'ancienne reunion, reconnaissables a « fusionnee_avec ». C'est le seul
       endroit de la plateforme qui ait jamais supprime une fiche — vider la
       liste d'une activite ou supprimer une activite retire des inscriptions,
       pas des fiches, et ne laisse rien a restaurer ici. */
    const LIMITE = 1000;
    const total = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE resource = 'participants' AND action = 'DELETE'
          AND details->>'fusionnee_avec' IS NOT NULL`
    );
    const r = await pool.query(
      `SELECT id, resource_id, resource_label, details, created_at
         FROM audit_logs
        WHERE resource = 'participants' AND action = 'DELETE'
          AND details->>'fusionnee_avec' IS NOT NULL
        ORDER BY created_at DESC
        LIMIT $1`,
      [LIMITE]
    );

    /* Une fiche deja remise en place ne doit plus etre proposee. On la
       reconnait a une trace de restauration portant le meme journal.

       La comparaison se fait en chaines des deux cotes, et ce n'est pas un
       detail : audit_logs.id est un BIGSERIAL, et le pilote PostgreSQL rend
       les entiers 64 bits en chaine pour ne pas perdre de precision. Compare
       a un ensemble de nombres, aucun identifiant ne correspondait jamais —
       518 fiches deja remises en place etaient donc proposees a nouveau,
       indefiniment. Le piege ne se voit pas sur une base d'essai dont la
       colonne serait un entier 32 bits : le pilote y rend un nombre, et tout
       semble marcher. */
    const { rows: faites } = await pool.query(
      `SELECT details->>'depuis_journal' AS journal
         FROM audit_logs
        WHERE resource = 'participants' AND action = 'CREATE'
          AND details->>'depuis_journal' IS NOT NULL`
    );
    const restaurees = new Set(faites.map((f) => String(f.journal)));

    const lignes = [];
    for (const l of r.rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      const f = d.fiche_absorbee;
      if (!f) continue;
      lignes.push({
        journal: l.id,
        supprimee_le: l.created_at,
        ancien_id: l.resource_id,
        fusionnee_avec: d.fusionnee_avec ?? null,
        restauree: restaurees.has(String(l.id)),
        fiche: {
          nom: f.nom || "", prenom: f.prenom || "",
          email: f.email || null, telephone: f.telephone || null,
          genre: f.genre || null, age_range: f.age_range || null,
          statut: f.statut || null, structure: f.structure || null,
        },
        activites: Array.isArray(f.activites) ? f.activites : [],
      });
    }

    /* Le titre des activites, pour que la decision se prenne sur un nom de
       formation et pas sur un numero. */
    const ids = [...new Set(lignes.flatMap((l) => l.activites))];
    let titres = new Map();
    if (ids.length) {
      const t = await pool.query(
        "SELECT id, title, to_char(activity_date,'YYYY-MM-DD') AS date FROM activities WHERE id = ANY($1::int[])",
        [ids]
      );
      titres = new Map(t.rows.map((x) => [x.id, x]));
    }
    for (const l of lignes) {
      l.activites = l.activites.map((id) => ({
        id,
        titre: titres.get(id)?.title || `Activité ${id}`,
        date: titres.get(id)?.date || null,
        existe: titres.has(id),
      }));
    }

    res.json({
      total: lignes.length,
      a_restaurer: lignes.filter((l) => !l.restauree).length,
      /* Une liste tronquee doit le dire : afficher 1000 lignes sur 1400 sans
         le signaler laisserait croire que le reste n'existe pas. On en
         restaure un lot, on recharge, la suite apparait. */
      tronquee: total.rows[0].n > LIMITE,
      total_journal: total.rows[0].n,
      lignes,
    });
  } catch (err) {
    console.error("[FICHES ABSORBEES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Remettre en place les fiches choisies, avec leurs inscriptions. La nouvelle
   fiche porte un autre identifiant — l'ancien est perdu — mais les listes de
   presence retrouvent leur ligne, et c'est ce qui compte pour les comptes. */
router.post("/fiches-absorbees/restaurer", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  let ouverte = false;
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Accès refusé" });

    const journaux = Array.isArray(req.body?.journaux)
      ? req.body.journaux.map(Number).filter(Number.isInteger) : [];
    if (!journaux.length) return res.status(400).json({ error: "Aucune fiche à restaurer." });

    const r = await client.query(
      `SELECT id, details FROM audit_logs
        WHERE id = ANY($1::int[]) AND resource = 'participants' AND action = 'DELETE'`,
      [journaux]
    );

    await client.query("BEGIN");
    ouverte = true;

    let restaurees = 0;
    let inscriptions = 0;
    let dejaFaites = 0;
    for (const l of r.rows) {
      const d = typeof l.details === "string" ? JSON.parse(l.details) : l.details || {};
      const f = d.fiche_absorbee;
      if (!f) continue;

      /* Deja remise en place ? On le verifie ici, dans la transaction, et pas
         seulement a l'affichage : un double clic, un rechargement, un appel
         repete recreerait sinon une seconde fiche — c'est-a-dire le defaut
         que cet ecran repare. */
      const { rows: faite } = await client.query(
        `SELECT 1 FROM audit_logs
          WHERE resource = 'participants' AND action = 'CREATE'
            AND details->>'depuis_journal' = $1 LIMIT 1`,
        [String(l.id)]
      );
      if (faite.length) { dejaFaites += 1; continue; }

      const { rows } = await client.query(
        `INSERT INTO participants (nom, prenom, email, telephone, genre, age_range, statut, structure)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [f.nom || "", f.prenom || "", f.email || null, f.telephone || null,
         f.genre || null, f.age_range || null, f.statut || null, f.structure || null]
      );
      const nouvelId = rows[0].id;

      for (const activityId of (Array.isArray(f.activites) ? f.activites : [])) {
        /* Une activite supprimee depuis ne peut pas recevoir l'inscription :
           on la passe plutot que de faire echouer la restauration entiere. */
        const ins = await client.query(
          `INSERT INTO activity_participants (activity_id, participant_id)
           SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM activities WHERE id = $1)
           ON CONFLICT DO NOTHING`,
          [activityId, nouvelId]
        );
        inscriptions += ins.rowCount;
      }

      /* La trace est attendue : c'est elle qui empeche la restauration
         suivante. Repondre avant qu'elle soit ecrite laisserait une fenetre
         ou la fiche serait de nouveau proposee. */
      await logAudit(req, "CREATE", "participants", nouvelId, `${f.prenom} ${f.nom}`, {
        motif: "fiche remise en place après une réunion",
        depuis_journal: l.id,
        ancien_id: d.fusionnee_avec ? String(d.fusionnee_avec) : null,
      });
      restaurees += 1;
    }

    await client.query("COMMIT");
    ouverte = false;
    res.json({ restaurees, inscriptions, deja_faites: dejaFaites });
  } catch (err) {
    if (ouverte) await client.query("ROLLBACK").catch(() => {});
    console.error("[RESTAURATION FICHES]", err);
    res.status(500).json({ error: "Erreur serveur" });
  } finally {
    client.release();
  }
});

module.exports = router;
