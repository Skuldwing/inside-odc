const express = require("express");
const pool = require("../db");
const authMiddleware = require("../middleware/auth.middleware");
const requireAdmin = require("../middleware/role.middleware");
const requireSuperAdmin = require("../middleware/superAdmin.middleware");
const requireAdminPin = require("../middleware/pin.middleware");
const { logAudit } = require("../services/audit");
const { ensureBudget } = require("../migrations/budget");
const { CAS_ZONE, chiffrer } = require("../services/budget");

const router = express.Router();

/* Tout ce qui suit est reserve aux Admin +. La chaine est toujours la meme :
   connecte, administrateur, puis le cran au-dessus. On ne l'ecrit qu'une fois,
   pour qu'aucune route ajoutee plus tard ne puisse l'oublier. */
const ADMIN_PLUS = [authMiddleware, requireAdmin, requireSuperAdmin];

/* Les seances sans partenaire forment un cas a part qu'on doit pouvoir
   selectionner comme les autres. Une valeur sentinelle plutot qu'un identifiant
   vide, qui se confondrait avec « tous ». Meme convention que l'ecran des
   campagnes. */
const SANS_PARTENAIRE = "__sans__";

/* Comme ailleurs dans la plateforme : si la migration de demarrage a echoue,
   la page tomberait sur « colonne inconnue » sans rien expliquer. */
let schemaRejoue = false;
async function avecSchema(travail) {
  try {
    return await travail();
  } catch (err) {
    const incomplet = err?.code === "42703" || err?.code === "42P01";
    if (!incomplet || schemaRejoue) throw err;
    schemaRejoue = true;
    console.warn("[BUDGET] schéma incomplet, migration rejouée");
    await ensureBudget();
    return travail();
  }
}

function lireParametres(ligne) {
  return {
    mode_paiement: ligne?.mode_paiement === "heure" ? "heure" : "beneficiaire",
    tarif_dakar: Number(ligne?.tarif_dakar || 0),
    tarif_region: Number(ligne?.tarif_region || 0),
    tarif_ligne: Number(ligne?.tarif_ligne || 0),
    devise: ligne?.devise || "FCFA",
    modifie_le: ligne?.modifie_le || null,
    modifie_par_nom: ligne?.modifie_par_nom || null,
  };
}

/* ===== LES PARAMÈTRES ===== */
router.get("/parametres", ...ADMIN_PLUS, async (req, res) => {
  try {
    const { rows } = await avecSchema(() =>
      pool.query("SELECT * FROM budget_parametres WHERE id = 1")
    );
    res.json(lireParametres(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* Le PIN est demandé ici comme pour l'objectif d'un partenaire : ces valeurs
   decident de ce qu'on doit payer, et une faute de frappe sur un tarif se
   propage a toute la page sans qu'aucun chiffre n'ait l'air faux. */
router.put("/parametres", ...ADMIN_PLUS, requireAdminPin, async (req, res) => {
  try {
    const mode = req.body?.mode_paiement === "heure" ? "heure" : "beneficiaire";

    const tarif = (v, nom) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        const e = new Error(`Le ${nom} doit être un nombre positif.`);
        e.attendu = true;
        throw e;
      }
      /* Deux decimales : les tarifs se negocient parfois en centimes, mais pas
         au-dela, et la colonne ne stocke pas davantage. */
      return Math.round(n * 100) / 100;
    };

    const valeurs = {
      mode_paiement: mode,
      tarif_dakar: tarif(req.body?.tarif_dakar, "tarif Dakar"),
      tarif_region: tarif(req.body?.tarif_region, "tarif régions"),
      tarif_ligne: tarif(req.body?.tarif_ligne, "tarif en ligne"),
      devise: String(req.body?.devise || "FCFA").trim().slice(0, 10) || "FCFA",
    };

    const avantRes = await avecSchema(() =>
      pool.query("SELECT * FROM budget_parametres WHERE id = 1")
    );
    const avant = lireParametres(avantRes.rows[0]);

    const qui = await pool.query("SELECT full_name FROM users WHERE id = $1", [req.user.id]);

    const { rows } = await avecSchema(() =>
      pool.query(
        `UPDATE budget_parametres
            SET mode_paiement = $1, tarif_dakar = $2, tarif_region = $3,
                tarif_ligne = $4, devise = $5,
                modifie_le = NOW(), modifie_par = $6, modifie_par_nom = $7
          WHERE id = 1
          RETURNING *`,
        [
          valeurs.mode_paiement, valeurs.tarif_dakar, valeurs.tarif_region,
          valeurs.tarif_ligne, valeurs.devise, req.user.id,
          qui.rows[0]?.full_name || null,
        ]
      )
    );

    const apres = lireParametres(rows[0]);
    const modifications = {};
    for (const champ of ["mode_paiement", "tarif_dakar", "tarif_region", "tarif_ligne", "devise"]) {
      if (avant[champ] !== apres[champ]) {
        modifications[champ] = { avant: avant[champ], apres: apres[champ] };
      }
    }
    if (Object.keys(modifications).length) {
      logAudit(req, "UPDATE", "budget_parametres", 1, "Paramètres de budget", {
        motif: "tarifs ou mode de paiement modifiés",
        modifications,
      });
    }

    res.json(apres);
  } catch (err) {
    if (err?.attendu) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== QUI EST ADMIN + =====
 *
 * Volontairement ici, et non dans la page Utilisateurs : seul un Admin + peut
 * en nommer un autre. Si un administrateur ordinaire pouvait s'accorder le
 * drapeau, la page budget ne serait privee que par politesse — et c'etait tout
 * l'interet d'avoir un cran de plus.
 *
 * Seuls les administrateurs apparaissent : le drapeau ne veut rien dire sur un
 * lecteur ou un partenaire, et le middleware verifie les deux de toute facon. */
router.get("/acces", ...ADMIN_PLUS, async (req, res) => {
  try {
    const { rows } = await avecSchema(() =>
      pool.query(
        `SELECT id, email, full_name, COALESCE(is_super_admin, false) AS admin_plus
           FROM users WHERE role = 'admin' ORDER BY full_name NULLS LAST, email`
      )
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/acces/:id", ...ADMIN_PLUS, requireAdminPin, async (req, res) => {
  try {
    const cible = Number(req.params.id);
    const accorder = req.body?.admin_plus === true;

    const { rows } = await avecSchema(() =>
      pool.query(
        `SELECT id, email, full_name, role, COALESCE(is_super_admin, false) AS admin_plus
           FROM users WHERE id = $1`,
        [cible]
      )
    );
    if (!rows.length) return res.status(404).json({ error: "Compte introuvable" });
    const u = rows[0];

    if (accorder && u.role !== "admin") {
      return res.status(400).json({
        error: "Seul un administrateur peut devenir Admin + : changez d'abord son rôle.",
      });
    }
    if (u.admin_plus === accorder) return res.json({ ...u, admin_plus: accorder });

    /* On ne laisse pas disparaitre le dernier. Sans cela, un retrait de trop
       fermerait la page a tout le monde, et il faudrait passer par la variable
       d'environnement et un redemarrage pour y revenir. */
    if (!accorder) {
      const { rows: reste } = await pool.query(
        "SELECT COUNT(*)::int AS n FROM users WHERE is_super_admin = TRUE AND id <> $1",
        [cible]
      );
      if (reste[0].n === 0) {
        return res.status(400).json({
          error: "C'est le dernier Admin + : nommez quelqu'un d'autre avant de le retirer.",
        });
      }
    }

    await pool.query("UPDATE users SET is_super_admin = $1 WHERE id = $2", [accorder, cible]);

    logAudit(req, "UPDATE", "users", cible, u.full_name || u.email, {
      motif: accorder
        ? "Admin + accordé : accès à la page budget"
        : "Admin + retiré : plus d'accès à la page budget",
      modifications: { admin_plus: { avant: u.admin_plus, apres: accorder } },
    });

    res.json({ ...u, admin_plus: accorder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/* ===== LA SYNTHÈSE ===== */
router.get("/synthese", ...ADMIN_PLUS, async (req, res) => {
  try {
    const annee = Number(req.query.year) || new Date().getFullYear();
    const mois = req.query.month ? Number(req.query.month) : null;

    let du = `${annee}-01-01`;
    let au = `${annee}-12-31`;
    if (mois && mois >= 1 && mois <= 12) {
      const dernier = new Date(annee, mois, 0).getDate();
      du = `${annee}-${String(mois).padStart(2, "0")}-01`;
      au = `${annee}-${String(mois).padStart(2, "0")}-${String(dernier).padStart(2, "0")}`;
    }

    /* La colonne de reserve peut manquer juste apres un deploiement : on
       regarde avant de composer, comme le fait le tableau de bord. Un litteral
       la remplace, ce qui revient a « rien n'est libere ». */
    const { rowCount: aReserve } = await pool.query(`
      SELECT 1 FROM information_schema.columns
       WHERE table_name = 'partners' AND column_name = 'reserve_activee' LIMIT 1
    `);
    const reserveExpr = aReserve > 0 ? "pr.reserve_activee" : "0";

    /* Un effectif compte une fois par activite et par zone. Le decompte passe
       par une sous-requete par activite — sinon la jointure sur les partenaires
       multiplierait les lignes — et seules les listes nominatives comptent :
       un effectif saisi a la main n'est pas facturable, on ne sait pas qui il
       recouvre. */
    const requete = `
      WITH eff AS (
        SELECT a.id                                   AS activite_id,
               COALESCE(a.partner_id, uc.partner_id)  AS partner_id,
               ${CAS_ZONE}                            AS zone,
               COALESCE(a.duration_hours, 0)          AS heures,
               (SELECT COUNT(*) FROM activity_participants ap
                 WHERE ap.activity_id = a.id)::int    AS beneficiaires
        FROM activities a
        LEFT JOIN users uc ON uc.id = a.coach_id
        WHERE a.activity_date BETWEEN $1 AND LEAST($2::date, CURRENT_DATE)
      )
      SELECT e.partner_id,
             MAX(pr.name)                                         AS partenaire,
             e.zone,
             SUM(e.beneficiaires)::int                            AS beneficiaires,
             COALESCE(SUM(CASE WHEN e.beneficiaires > 0 THEN e.heures ELSE 0 END), 0)::numeric AS heures,
             COALESCE(MAX(pr.objective_beneficiaries), 0)::int     AS objective_beneficiaries,
             COALESCE(MAX(${reserveExpr}), 0)::int                 AS reserve_activee
      FROM eff e
      LEFT JOIN partners pr ON pr.id = e.partner_id
      WHERE e.beneficiaires > 0
      GROUP BY e.partner_id, e.zone
    `;

    const [lignesRes, paramsRes] = await Promise.all([
      avecSchema(() => pool.query(requete, [du, au])),
      avecSchema(() => pool.query("SELECT * FROM budget_parametres WHERE id = 1")),
    ]);

    const parametres = lireParametres(paramsRes.rows[0]);
    const toutes = lignesRes.rows;

    /* La liste des partenaires presents sur la periode, etablie AVANT tout
       filtrage : c'est elle qui remplit le selecteur. La tirer des lignes
       filtrees le viderait de tout sauf du choix en cours, et on ne pourrait
       plus en sortir. */
    const roster = [];
    const vus = new Set();
    for (const l of toutes) {
      const cle = l.partner_id == null ? SANS_PARTENAIRE : String(l.partner_id);
      if (vus.has(cle)) continue;
      vus.add(cle);
      roster.push({
        id: cle,
        nom: l.partenaire || (l.partner_id == null ? "Sans partenaire" : `Partenaire #${l.partner_id}`),
      });
    }
    roster.sort((a, b) =>
      /* « Sans partenaire » en dernier : c'est un cas a part, pas un
         partenaire, et il n'a rien a faire au milieu de la liste. */
      (a.id === SANS_PARTENAIRE) - (b.id === SANS_PARTENAIRE) ||
      a.nom.localeCompare(b.nom, "fr")
    );

    /* Le filtre porte sur tout le chiffrage, pas seulement sur l'affichage du
       tableau par partenaire. Masquer des lignes sans recalculer laisserait un
       total qui ne correspond plus a ce qu'on voit — exactement ce qu'on
       s'applique a eviter sur cette page. */
    const demande = String(req.query.partenaire || "").trim();
    /* Un identifiant qui ne designe personne vaut « tous ». Filtrer sur du vide
       afficherait une page de zeros, ce qui se lit comme une panne et non comme
       un choix. */
    const choisi = roster.some((r) => r.id === demande) ? demande : null;
    const lignes = !choisi
      ? toutes
      : toutes.filter((l) =>
          choisi === SANS_PARTENAIRE
            ? l.partner_id == null
            : String(l.partner_id) === choisi
        );

    const chiffrage = chiffrer(lignes, parametres);

    res.json({
      periode: { annee, mois: mois || null, du, au },
      parametres,
      roster,
      /* Ce qui a reellement ete applique : un identifiant qui ne designe
         personne vaut « tous », et l'ecran doit pouvoir le refleter plutot que
         d'afficher un filtre actif sur un chiffre qui ne l'est pas. */
      filtre: choisi,
      ...chiffrage,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
