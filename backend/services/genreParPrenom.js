/**
 * Déduire un genre manquant à partir du prénom.
 *
 * ---- LA SOURCE : LA BASE ELLE-MÊME ----
 *
 * Une liste de prénoms générique se tromperait ici : elle ne connaît ni les
 * prénoms sénégalais, ni leurs orthographes — « Ndèye », « Ndeye »,
 * « Ndéye » —, ni les prénoms composés. La base, elle, contient des milliers de
 * personnes dont le genre a été déclaré. Pour chaque prénom, on compte combien
 * sont des femmes et combien sont des hommes, et l'on ne déduit que là où la
 * réponse est nette.
 *
 * ---- LA RÈGLE ----
 *
 *  - Au moins MIN_PERSONNES personnes distinctes portant ce prénom, avec un
 *    genre déclaré. En dessous, une coïncidence suffit à tromper.
 *  - Au moins ACCORD_MIN d'entre elles du même genre. « Ndèye » ou « Mame »
 *    se partagent : on ne devine pas, on laisse à un humain.
 *
 * On compte des PERSONNES, pas des fiches : la même Aminata inscrite à cinq
 * formations ne vaut pas cinq témoignages. Une personne est reconnue à son nom
 * et son prénom, une fois l'écriture uniformisée.
 *
 * ---- LES PRÉNOMS COMPOSÉS ----
 *
 * « Fatou Bintou » est rare en entier ; « Fatou » ne l'est pas. Quand le prénom
 * entier n'a pas assez de témoins, on se rabat sur le premier prénom — mais
 * seulement si le prénom entier n'est pas lui-même connu pour être partagé. Si
 * « Mame Diarra » est ambigu, on ne va pas chercher « Mame » pour trancher.
 *
 * ---- CE QUI NE COMPTE PAS COMME TÉMOIN ----
 *
 * Un genre déjà déduit. Sans cette exclusion, chaque déduction appliquée
 * deviendrait la preuve de la suivante, et une erreur se renforcerait
 * elle-même à chaque passage.
 */

const MIN_PERSONNES = 5;
const ACCORD_MIN = 0.95;

const sansAccents = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/* « Ndèye-Fatou », « NDEYE  fatou », « ndeye fatou » : la même chose. */
function normaliserPrenom(prenom) {
  return sansAccents(prenom)
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/* Le genre tel qu'il est écrit en base : « F », « f », « Femme », « Féminin »,
   « H », « Homme », « M », « Masculin ». Tout le reste — « Autre », une valeur
   inattendue — ne témoigne de rien. */
function genreDeclare(valeur) {
  const v = sansAccents(valeur).trim().toLowerCase();
  if (!v) return null;
  if (v === "f" || v.startsWith("fem") || v === "female") return "F";
  if (v === "h" || v === "m" || v.startsWith("hom") || v.startsWith("masc") || v === "male") return "H";
  return null;
}

const estVide = (v) => v === null || v === undefined || String(v).trim() === "";

function ajouter(table, cle, genre, personne) {
  if (!table.has(cle)) table.set(cle, { F: new Set(), H: new Set() });
  table.get(cle)[genre].add(personne);
}

/**
 * Les témoins : pour chaque prénom (entier, et premier prénom), les personnes
 * de chaque genre.
 *
 * @param {Array<{nom, prenom, genre, genre_source}>} fiches  toutes les fiches
 */
function construireTemoins(fiches) {
  const complet = new Map();
  const premier = new Map();
  for (const f of fiches) {
    if (f.genre_source === "deduit") continue;
    const genre = genreDeclare(f.genre);
    if (!genre) continue;
    const prenom = normaliserPrenom(f.prenom);
    if (!prenom) continue;
    const personne = `${normaliserPrenom(f.nom)}|${prenom}`;
    ajouter(complet, prenom, genre, personne);
    ajouter(premier, prenom.split(" ")[0], genre, personne);
  }
  return { complet, premier };
}

function verdict(entree) {
  if (!entree) return { statut: "inconnu", f: 0, h: 0 };
  const f = entree.F.size;
  const h = entree.H.size;
  const n = f + h;
  if (n < MIN_PERSONNES) return { statut: "trop_rare", f, h };
  const genre = f >= h ? "F" : "H";
  const accord = Math.max(f, h) / n;
  if (accord < ACCORD_MIN) return { statut: "ambigu", f, h, accord };
  return { statut: "fiable", genre, f, h, accord };
}

/* L'orthographe la plus fréquente d'un groupe, pour l'afficher : « aminata »
   se lit mal, « Aminata » se reconnaît. */
function graphieDominante(compte) {
  let meilleure = null;
  let max = -1;
  for (const [graphie, n] of compte) {
    if (n > max) { max = n; meilleure = graphie; }
  }
  return meilleure;
}

/**
 * Les propositions pour les fiches sans genre, regroupées par prénom.
 *
 * Regrouper est ce qui rend la revue possible : quatre mille fiches à cocher
 * une à une, personne ne le fera ; « Aminata → Femme, 212 fiches » se valide
 * en un coup d'œil.
 *
 * @returns {{propositions: Array, refus: Array, total: number, deductibles: number}}
 */
function proposer(fiches) {
  const temoins = construireTemoins(fiches);
  const groupes = new Map();
  const refus = new Map();
  let total = 0;

  for (const f of fiches) {
    if (!estVide(f.genre)) continue;
    total += 1;

    const prenom = normaliserPrenom(f.prenom);
    if (!prenom) {
      const r = refus.get("") || { cle: "", raison: "sans_prenom", f: 0, h: 0, fiches: 0, graphies: new Map() };
      r.fiches += 1;
      refus.set("", r);
      continue;
    }

    let base = "complet";
    let cle = prenom;
    let v = verdict(temoins.complet.get(prenom));
    /* Ce qu'on dira du refus. Quand le premier prénom a été consulté, c'est
       lui qui explique : « Mame Diarra » n'est pas « jamais vu », il est
       bloqué parce que « Mame » est partagé — et le dire autrement laisserait
       croire qu'une saisie de plus suffirait à le débloquer. */
    let motif = v;

    /* Le premier prénom, seulement si le prénom entier manque de témoins.
       S'il est connu pour être partagé, on s'arrête là. */
    if ((v.statut === "inconnu" || v.statut === "trop_rare") && prenom.includes(" ")) {
      const tete = prenom.split(" ")[0];
      const v2 = verdict(temoins.premier.get(tete));
      if (v2.statut === "fiable") { base = "premier"; cle = tete; v = v2; }
      else if (v2.statut === "ambigu" || (v2.statut === "trop_rare" && v.statut === "inconnu")) {
        motif = { ...v2, premier: tete };
      }
    }

    if (v.statut !== "fiable") {
      const r = refus.get(prenom) || {
        cle: prenom, raison: motif.statut, f: motif.f, h: motif.h,
        premier: motif.premier || null, fiches: 0, graphies: new Map(),
      };
      r.fiches += 1;
      const g = String(f.prenom).trim();
      r.graphies.set(g, (r.graphies.get(g) || 0) + 1);
      refus.set(prenom, r);
      continue;
    }

    const id = `${base}:${cle}`;
    const groupe = groupes.get(id) || {
      id, base, cle, genre: v.genre, f: v.f, h: v.h, accord: v.accord,
      ids: [], graphies: new Map(),
    };
    groupe.ids.push(f.id);
    const g = String(f.prenom).trim();
    groupe.graphies.set(g, (groupe.graphies.get(g) || 0) + 1);
    groupes.set(id, groupe);
  }

  const propositions = [...groupes.values()]
    .map((g) => ({
      id: g.id,
      base: g.base,
      prenom: graphieDominante(g.graphies),
      genre: g.genre,
      fiches: g.ids.length,
      f: g.f,
      h: g.h,
      accord: Math.round(g.accord * 1000) / 1000,
      ids: g.ids,
    }))
    .sort((a, b) => b.fiches - a.fiches || a.prenom.localeCompare(b.prenom, "fr"));

  const refusListe = [...refus.values()]
    .map((r) => ({
      /* La clé normalisée : c'est par elle que l'écran désigne le prénom quand
         un administrateur lui attribue un genre. */
      cle: r.cle,
      prenom: r.cle ? graphieDominante(r.graphies) : "",
      raison: r.raison,
      /* Le premier prénom en cause, quand c'est lui qui bloque. */
      premier: r.premier ? r.premier.charAt(0).toUpperCase() + r.premier.slice(1) : null,
      fiches: r.fiches,
      f: r.f,
      h: r.h,
    }))
    .sort((a, b) => b.fiches - a.fiches);

  const deductibles = propositions.reduce((s, p) => s + p.fiches, 0);
  return { propositions, refus: refusListe, total, deductibles };
}

module.exports = {
  MIN_PERSONNES,
  ACCORD_MIN,
  normaliserPrenom,
  genreDeclare,
  construireTemoins,
  proposer,
};
