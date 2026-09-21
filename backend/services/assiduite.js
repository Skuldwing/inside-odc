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

/* Deux fiches se contredisent si elles portent toutes deux une adresse et que
   ces adresses different, ou toutes deux un numero et qu'ils different. Une
   information absente d'un cote ne contredit rien : c'est le cas ordinaire
   d'une liste qui ne demandait pas cette colonne. */
function seContredisent(a, b) {
  if (a.mail && b.mail && a.mail !== b.mail) return true;
  if (a.tel && b.tel && a.tel !== b.tel) return true;
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
        structure: l.structure || null,
        mail: mailNormalise(l.email),
        tel: telNormalise(l.telephone),
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

  const contactsDuGroupe = (indices) => {
    const mails = new Set(), tels = new Set();
    for (const i of indices) {
      if (liste[i].mail) mails.add(liste[i].mail);
      if (liste[i].tel) tels.add(liste[i].tel);
    }
    return { mails, tels };
  };

  for (const indices of parNom.values()) {
    if (indices.length < 2) continue;
    /* On regroupe par racine courante, puis on tente de reunir ces groupes. */
    const groupes = new Map();
    for (const i of indices) {
      const r = union.racine(i);
      if (!groupes.has(r)) groupes.set(r, []);
      groupes.get(r).push(i);
    }
    const racines = [...groupes.keys()];
    for (let x = 0; x < racines.length; x++) {
      for (let y = x + 1; y < racines.length; y++) {
        const ga = contactsDuGroupe(groupes.get(racines[x]));
        const gb = contactsDuGroupe(groupes.get(racines[y]));
        const contredit =
          [...ga.mails].some((m) => gb.mails.size && !gb.mails.has(m)) ||
          [...ga.tels].some((t) => gb.tels.size && !gb.tels.has(t));
        if (!contredit) union.unir(racines[x], racines[y]);
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

module.exports = { classerParAssiduite, telNormalise, mailNormalise, seContredisent };
