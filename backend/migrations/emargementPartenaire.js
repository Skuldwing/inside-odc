const pool = require("../db");

/**
 * Emargement par lien et QR code, autorise partenaire par partenaire.
 *
 * Le formulaire ouvert par lien ou QR code est public : quiconque possede
 * l'adresse peut s'inscrire a l'activite. C'est ce qui en fait la commodite —
 * on projette le code, la salle s'inscrit — et c'est aussi ce qui fait qu'un
 * partenaire peut ne pas en vouloir : une liste de presence qui engage son
 * nom, ou des beneficiaires dont il ne souhaite pas que les coordonnees
 * transitent par un formulaire ouvert.
 *
 * Le reglage vit sur le partenaire, pas sur l'activite : c'est une decision
 * de convention, prise une fois, pas un choix a refaire a chaque seance.
 *
 * Par defaut a TRUE : la plateforme fonctionne ainsi depuis le debut, et une
 * migration qui fermerait l'emargement partout casserait les activites en
 * cours sans que personne l'ait demande.
 */
async function ensureEmargementPartenaire() {
  await pool.query(
    `ALTER TABLE partners
       ADD COLUMN IF NOT EXISTS emargement_actif BOOLEAN NOT NULL DEFAULT TRUE`
  );
}

module.exports = { ensureEmargementPartenaire };
