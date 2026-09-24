const { clePersonne, normaliser } = require("./nomsDoublons");

/**
 * Assiduite : combien de modules une personne a suivis, et lesquels.
 *
 * La difficulte n'est pas de compter, c'est de savoir qui est qui. Une
 * personne qui revient a trois formations figure sur trois listes de presence,
 * remplies a trois moments differents, parfois par elle-meme et parfois par
 * l'equipe. Elle peut donc avoir trois fiches. Les compter separement
 * afficherait trois personnes a un module au lieu d'une personne a trois.
 *
 * On rapproche sur ce que la personne a communique : adresse, telephone, nom.
 *
 * L'ordre n'est pas indifferent. Une adresse ou un numero designent une
 * personne — deux fiches qui les partagent sont la meme. Un nom, non : deux
 * personnes peuvent porter le meme, et ce cas s'est deja presente dans cette
 * base. On ne rapproche donc sur le nom que si rien ne s'y oppose : deux
 * fiches qui portent le meme nom mais deux adresses differentes, ou deux
 * numeros differents, restent deux personnes — et sont signalees comme
 * homonymes, pour qu'on puisse verifier plutot que decider a leur place.
 *
 * « Rien ne s'y oppose » ne peut pas se limiter aux coordonnees. Les listes
 * de presence des ateliers pour enfants n'en portent souvent aucune : une
 * fiche sans adresse ni numero ne contredisait donc personne et rejoignait
 * n'importe quel homonyme. Un adulte inscrit en Tech Academy se retrouvait
 * credite d'un module Kids Tech suivi par un enfant du meme nom — et ce
 * module serait parti sur son attestation.
 *
 * Le genre et la tranche d'age sont donc lus comme les coordonnees : ils
 * decrivent la personne, pas ce qu'elle a fait, et deux fiches qui les
 * declarent de facon incompatible ne sont pas la meme personne.
 */

/* Un numero se compare sans espaces ni ponctuation : « 77 123 45 67 » et
   « 77-123-45-67 » sont le meme. On ignore aussi l'indicatif du Senegal, que
   certaines listes portent et d'autres non. */
function telNormalise(v) {
  const chiffres = String(v || "").replace(/\D+/g, "");
  if (!chiffres) return null;
  const sansIndicatif = chiffres.replace(/^(?:00221|221)/, "");
  return sansIndicatif.length >= 7 ? sansIndicatif : null;
}

function mailNormalise(v) {
  const t = String(v || "").trim().toLowerCase();
  return t.includes("@") ? t : null;
}

/* La tranche d'age arrive telle que la liste l'a ecrite : « 13-17 »,
   « 18 - 25 », « 36 ans et plus », « moins de 13 ans ». On en retient les
   bornes chiffrees, et rien de plus. */
function intervalleAge(valeur) {
  const trouves = String(valeur || "").match(/\d+/g);
  if (!trouves) return null;
  const nombres = trouves.map(Number).filter((n) => n >= 0 && n <= 120);
  if (!nombres.length) return null;
  return { min: Math.min(...nombres), max: Math.max(...nombres) };
}

/* Deux tranches se contredisent quand un ecart les separe. On tolere les
   voisines : quelqu'un declare « 18-25 » en 2023 peut etre « 26-35 » en 2026,
   et la meme personne change de tranche sans changer d'identite. « 13-17 » et
   « 26-35 », en revanche, ne peuvent pas designer quelqu'un d'unique. */
function agesIncompatibles(a, b) {
  const x = intervalleAge(a), y = intervalleAge(b);
  if (!x || !y) return false;
  const ecart = x.min > y.max ? x.min - y.max : y.min > x.max ? y.min - x.max : 0;
  return ecart > 1;
}

/* Deux fiches se contredisent si elles portent toutes deux une adresse et que
   ces adresses different, ou toutes deux un numero et qu'ils different. Une
   information absente d'un cote ne contredit rien : c'est le cas ordinaire
   d'une liste qui ne demandait pas cette colonne.

   Le genre et la tranche d'age comptent au meme titre : ils decrivent la
   personne. C'est ce qui separe un enfant de Kids Tech d'un adulte de Tech
   Academy quand aucun des deux ne porte de coordonnees. */
function seContredisent(a, b) {
  if (a.mail && b.mail && a.mail !== b.mail) return true;
  if (a.tel && b.tel && a.tel !== b.tel) return true;
  if (a.genreCompare && b.genreCompare && a.genreCompare !== b.genreCompare) return true;
  if (agesIncompatibles(a.age, b.age)) return true;
  return false;
}

/* Ensembles disjoints : chaque fiche commence seule, les rapprochements les
   reunissent. C'est ce qui permet a un chainage — fiche A et B par le
   telephone, B et C par l'adresse — de former un seul groupe. */
function creerUnion(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const racine = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  return {
    racine,
    unir(i, j) {
      const ri = racine(i), rj = racine(j);
      if (ri !== rj) parent[rj] = ri;
    },
  };
}

/**
 * @param {Array} lignes  une ligne par (fiche, activite), telles que la
 *                        requete les renvoie : id, nom, prenom, email,
 *                        telephone, plus activity_id, titre, date, dispositif.
 * @returns {Array} une entree par personne, la plus assidue en tete.
 */
function classerParAssiduite(lignes) {
  /* Une fiche peut revenir sur plusieurs lignes — une par activite. On la
     reduit d'abord a une identite, en gardant ses activites a cote. */
  const fiches = new Map();
  for (const l of lignes) {
    if (!fiches.has(l.id)) {
      fiches.set(l.id, {
        id: l.id,
        nom: l.nom || "",
        prenom: l.prenom || "",
        email: l.email || null,
        telephone: l.telephone || null,
        genre: l.genre || null,
        age: l.age_range || null,
        structure: l.structure || null,
        mail: mailNormalise(l.email),
        tel: telNormalise(l.telephone),
        /* « H », « h », « Homme » : c'est la meme declaration. */
        genreCompare: l.genre ? normaliser(l.genre).slice(0, 1) : null,
        cle: clePersonne(l.nom, l.prenom),
        activites: [],
      });
    }
    if (l.activity_id) {
      fiches.get(l.id).activites.push({
        id: l.activity_id,
        titre: l.titre || "",
        date: l.date || null,
        dispositif: l.dispositif || null,
        /* Quelle fiche etait inscrite a cette activite. Le groupe en reunit
           plusieurs ; pour ecrire ou lire un envoi d'attestation, il faut
           celle-la precisement, pas l'identite d'affichage. */
        fiche_id: l.id,
      });
    }
  }

  const liste = [...fiches.values()];
  const union = creerUnion(liste.length);

  /* 1. L'adresse et le numero designent une personne : on rapproche sans
        reserve. */
  for (const champ of ["mail", "tel"]) {
    const vus = new Map();
    liste.forEach((f, i) => {
      const v = f[champ];
      if (!v) return;
      if (vus.has(v)) union.unir(vus.get(v), i);
      else vus.set(v, i);
    });
  }

  /* 2. Le nom ne designe pas une personne. On ne rapproche deux fiches de meme
        nom que si rien ne s'y oppose — et on compare les groupes deja formes,
        pas les fiches isolees : une fiche sans adresse ne doit pas rejoindre
        un groupe dont une autre fiche porte une adresse differente de sa
        voisine. */
  const parNom = new Map();
  liste.forEach((f, i) => {
    if (!f.cle) return;
    if (!parNom.has(f.cle)) parNom.set(f.cle, []);
    parNom.get(f.cle).push(i);
  });

  /* Tout ce qu'un groupe declare sur la personne — pas sur ce qu'elle a fait.
     Le genre et la tranche d'age s'y ajoutent aux coordonnees : sans eux, un
     groupe depourvu d'adresse et de numero ne contredisait jamais rien et
     absorbait n'importe quel homonyme. */
  const signesDuGroupe = (indices) => {
    const mails = new Set(), tels = new Set(), genres = new Set(), ages = new Set();
    for (const i of indices) {
      if (liste[i].mail) mails.add(liste[i].mail);
      if (liste[i].tel) tels.add(liste[i].tel);
      if (liste[i].genreCompare) genres.add(liste[i].genreCompare);
      if (liste[i].age) ages.add(liste[i].age);
    }
    return { mails, tels, genres, ages };
  };

  /* Un desaccord : les deux cotes se prononcent, et pas de la meme facon. Un
     cote muet ne contredit rien. */
  const desaccord = (a, b) => a.size > 0 && b.size > 0 && [...a].some((v) => !b.has(v));
  const agesEnDesaccord = (a, b) => {
    for (const x of a) for (const y of b) if (agesIncompatibles(x, y)) return true;
    return false;
  };

  const sOpposent = (ga, gb) =>
    desaccord(ga.mails, gb.mails) ||
    desaccord(ga.tels, gb.tels) ||
    desaccord(ga.genres, gb.genres) ||
    agesEnDesaccord(ga.ages, gb.ages);

  for (const indices of parNom.values()) {
    if (indices.length < 2) continue;

    /* On reunit un groupe a la fois, puis on recommence : une reunion change
       ce que le groupe declare, et la suivante doit en tenir compte. Sans
       cela, une fiche sans coordonnees servait de pont — elle rejoignait un
       groupe portant une adresse, puis un autre en portant une differente,
       et les trois n'en faisaient plus qu'un. */
    let change = true;
    while (change) {
      change = false;

      const groupes = new Map();
      for (const i of indices) {
        const r = union.racine(i);
        if (!groupes.has(r)) groupes.set(r, []);
        groupes.get(r).push(i);
      }
      const racines = [...groupes.keys()];
      if (racines.length < 2) break;

      const signes = new Map(racines.map((r) => [r, signesDuGroupe(groupes.get(r))]));
      const compatiblesDe = (r) =>
        racines.filter((autre) => autre !== r && !sOpposent(signes.get(r), signes.get(autre)));

      for (const r of racines) {
        const candidats = compatiblesDe(r);
        /* Un seul candidat possible, et reciproquement : c'est la seule
           lecture du nom qui ne tranche pas a la place de quelqu'un. Deux
           candidats qui se contredisent entre eux, c'est un tirage au sort —
           et le perdant se verrait attribuer des modules qu'il n'a pas
           suivis. On laisse alors les groupes separes ; ils ressortent
           signales comme homonymes, a verifier a la main. */
        if (candidats.length !== 1) continue;
        const reciproque = compatiblesDe(candidats[0]);
        if (reciproque.length !== 1 || reciproque[0] !== r) continue;

        union.unir(r, candidats[0]);
        change = true;
        break;
      }
    }
  }

  /* Assemblage. */
  const groupes = new Map();
  liste.forEach((f, i) => {
    const r = union.racine(i);
    if (!groupes.has(r)) groupes.set(r, []);
    groupes.get(r).push(f);
  });

  /* Un nom qui se retrouve dans plusieurs groupes distincts : ce sont des
     homonymes que l'on a deliberement laisses separes. On le dit, pour qu'on
     puisse verifier plutot que de croire a une erreur de comptage. */
  const groupesParNom = new Map();
  for (const [r, membres] of groupes) {
    for (const f of membres) {
      if (!f.cle) continue;
      if (!groupesParNom.has(f.cle)) groupesParNom.set(f.cle, new Set());
      groupesParNom.get(f.cle).add(r);
    }
  }

  const resultat = [];
  for (const [r, membres] of groupes) {
    /* L'identite affichee vient de la fiche la mieux renseignee : c'est celle
       qui portera une adresse et un numero plutot qu'un nom seul. */
    const renseignes = (f) => [f.email, f.telephone, f.genre, f.structure].filter(Boolean).length;
    const principale = [...membres].sort((a, b) => renseignes(b) - renseignes(a) || a.id - b.id)[0];

    /* Une personne ne compte qu'une fois par activite, meme si deux de ses
       fiches y figurent. On retient alors toutes ces fiches : garder la
       premiere rencontree suffisait a compter, pas a relire ce qui a ete
       ecrit sur l'une d'elles — un envoi trace sur la seconde serait invisible
       et la personne resservie. */
    const parActivite = new Map();
    for (const f of membres) {
      for (const a of f.activites) {
        const connue = parActivite.get(a.id);
        if (connue) connue.fiche_ids.push(a.fiche_id);
        else parActivite.set(a.id, { ...a, fiche_ids: [a.fiche_id] });
      }
    }
    const modules = [...parActivite.values()].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );

    const homonymes = principale.cle ? (groupesParNom.get(principale.cle)?.size || 1) > 1 : false;

    resultat.push({
      cle: `g${r}`,
      nom: principale.nom,
      prenom: principale.prenom,
      email: principale.email,
      telephone: principale.telephone,
      genre: principale.genre,
      structure: principale.structure,
      /* Les identifiants de fiches : l'interface peut y renvoyer, et le
         chiffre dit si l'information de cette personne est eparpillee. */
      fiches: membres.map((f) => f.id).sort((a, b) => a - b),
      modules,
      total_modules: modules.length,
      homonymes,
    });
  }

  /* Le plus assidu en tete — c'est l'objet du classement. A egalite, l'ordre
     alphabetique, pour que la liste soit stable d'un affichage a l'autre. */
  resultat.sort(
    (a, b) =>
      b.total_modules - a.total_modules ||
      normaliser(`${a.nom} ${a.prenom}`).localeCompare(normaliser(`${b.nom} ${b.prenom}`))
  );
  return resultat;
}

/* « H », « h », « Homme » : c'est la meme declaration. Deux lettres
   differentes, en revanche, designent deux personnes. */
function genresIncompatibles(a, b) {
  const x = a ? normaliser(a).slice(0, 1) : null;
  const y = b ? normaliser(b).slice(0, 1) : null;
  return Boolean(x && y && x !== y);
}

module.exports = {
  classerParAssiduite, telNormalise, mailNormalise, seContredisent,
  /* Les regles qui disent que deux fiches ne peuvent pas etre la meme
     personne. Le nettoyage des doublons s'en sert aussi : une regle
     d'identite qui existerait en deux exemplaires finirait par diverger, et
     les deux ecrans ne diraient plus la meme chose de la meme personne. */
  agesIncompatibles, genresIncompatibles, intervalleAge,
};
