const pool = require("../db");

/**
 * Les personnes dont on a fini de servir les attestations.
 *
 * La trace d'envoi (attestations_envoyees) dit ce qui est parti depuis la
 * plateforme. Elle ne dit rien du reste : une attestation remise en main
 * propre, un document envoye depuis une autre boite, un beneficiaire qui a
 * fait savoir qu'il n'en voulait pas. Ces personnes restaient dans la liste des
 * gens a servir, indefiniment, et il fallait se souvenir de les sauter.
 *
 * Cette marque est donc une decision, pas un constat : quelqu'un dit « pour
 * celle-la, c'est regle ».
 *
 * Elle porte l'etat du parcours au moment ou elle est posee. C'est ce qui la
 * rend sure : si la personne suit une nouvelle formation ensuite, la marque ne
 * couvre plus ce qui vient de s'ajouter, et la personne revient dans la liste
 * — sinon la case cochee ferait disparaitre pour toujours quelqu'un qui a
 * droit a un nouveau document.
 *
 * Une ligne par fiche, pas par personne : une personne est un groupe de fiches
 * reconstitue a la volee, et ce groupe n'a pas d'identifiant stable d'un
 * affichage a l'autre. Marquer chacune de ses fiches survit au regroupement,
 * quel qu'il devienne.
 */
async function ensureAttestationsTerminees() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attestations_terminees (
      participant_id INTEGER PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
      activites      INTEGER[] NOT NULL DEFAULT '{}',
      marque_par     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      marque_par_nom TEXT,
      marque_le      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

module.exports = { ensureAttestationsTerminees };
