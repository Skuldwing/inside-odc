/**
 * Reunir et separer des fiches, sans jamais rien supprimer.
 *
 * Une fiche est une ligne de liste de presence : elle reste telle qu'elle a
 * ete ecrite. Ce qui bouge, c'est la personne a laquelle on la rattache.
 *
 * Toute la difference est la. Supprimer une inscription fait disparaitre une
 * ligne d'une feuille d'emargement — et si le rapprochement etait faux, un
 * vrai beneficiaire disparait d'une liste ou il figurait. Deplacer un
 * rattachement ne touche a aucune ligne : le compte des personnes distinctes
 * baisse, celui des lignes de presence ne bouge pas, et on peut revenir en
 * arriere exactement.
 */

/* Les identifiants des personnes concernees, dans l'ordre. */
async function personnesDeFiches(client, ficheIds) {
  if (!ficheIds.length) return new Map();
  const { rows } = await client.query(
    "SELECT id, personne_id FROM participants WHERE id = ANY($1::int[])",
    [ficheIds]
  );
  return new Map(rows.map((r) => [r.id, r.personne_id]));
}

/**
 * Rattache plusieurs fiches a une meme personne.
 *
 * L'identite retenue est la plus ancienne du groupe : elle a le plus de
 * chances d'etre celle que d'autres tables designent deja.
 *
 * @returns {{personne: number, deplacees: Array<{fiche: number, avant: number}>}}
 *          de quoi defaire exactement, fiche par fiche.
 */
async function reunir(client, ficheIds) {
  const ids = [...new Set(ficheIds)].filter(Number.isInteger);
  if (ids.length < 2) return { personne: null, deplacees: [] };

  const avant = await personnesDeFiches(client, ids);
  const connues = [...avant.values()].filter(Boolean);
  if (!connues.length) return { personne: null, deplacees: [] };

  const personne = Math.min(...connues);
  const aDeplacer = ids.filter((f) => avant.get(f) && avant.get(f) !== personne);
  if (!aDeplacer.length) return { personne, deplacees: [] };

  await client.query(
    "UPDATE participants SET personne_id = $1 WHERE id = ANY($2::int[])",
    [personne, aDeplacer]
  );

  return {
    personne,
    deplacees: aDeplacer.map((f) => ({ fiche: f, avant: avant.get(f) })),
  };
}

/**
 * Defait une reunion : chaque fiche retrouve l'identite qu'elle portait.
 *
 * On reecrit les identites d'avant plutot que d'en creer de nouvelles — c'est
 * ce qui rend l'operation exacte : apres l'avoir defaite, la base est dans
 * l'etat ou elle etait, pas dans un etat equivalent.
 */
async function defaire(client, deplacees) {
  let remises = 0;
  for (const { fiche, avant } of deplacees || []) {
    if (!Number.isInteger(fiche) || !Number.isInteger(avant)) continue;
    /* L'identite d'origine peut n'etre plus portee par personne : on la
       recree avec son numero, sinon la cle etrangere la refuserait. */
    await client.query(
      "INSERT INTO personnes (id) VALUES ($1) ON CONFLICT (id) DO NOTHING",
      [avant]
    );
    /* Sans effet si c'est deja fait : defaire deux fois le meme rapprochement
       doit rester sans consequence, sinon l'ecran annonce des remises en
       place qui n'ont rien remis. */
    const r = await client.query(
      "UPDATE participants SET personne_id = $1 WHERE id = $2 AND personne_id IS DISTINCT FROM $1",
      [avant, fiche]
    );
    remises += r.rowCount;
  }
  return remises;
}

/**
 * Donne a une fiche une identite neuve, qu'elle ne partage avec personne.
 * Sert quand on constate apres coup que deux homonymes avaient ete confondus.
 */
async function separer(client, ficheId) {
  const { rows } = await client.query(
    "INSERT INTO personnes DEFAULT VALUES RETURNING id"
  );
  await client.query(
    "UPDATE participants SET personne_id = $1 WHERE id = $2",
    [rows[0].id, ficheId]
  );
  return rows[0].id;
}

/* Le fragment SQL qui compte des personnes plutot que des lignes. Les deux
   chiffres se lisent cote a cote : « 310 lignes de presence, 279 personnes ».
   Un seul chiffre portait les deux sens, et personne ne pouvait dire lequel
   il lisait. */
const COMPTE_PERSONNES =
  "COUNT(DISTINCT COALESCE(p.personne_id, -p.id))::int";

module.exports = { reunir, defaire, separer, personnesDeFiches, COMPTE_PERSONNES };
