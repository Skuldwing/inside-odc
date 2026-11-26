/**
 * Les doublons d'une liste de présence.
 *
 * C'est le premier garde-fou de la plateforme : avant qu'une liste n'entre, on
 * cherche qui y figure deux fois. Une même personne revient souvent sur une
 * feuille — inscrite le matin, réinscrite l'après-midi, recopiée par deux
 * mains —, et chaque ligne en trop gonfle les compteurs d'un bénéficiaire qui
 * n'existe pas.
 *
 * La détection travaillait sur la seule égalité des noms, et sur une liste
 * déjà rapprochée de toute la base. Elle manquait ainsi des cas évidents :
 * « Awa NIANG » et « NIANG Awa » quand la base s'en mêlait, deux lignes au
 * même nom dont l'une seulement portait un numéro, « 77 123 45 67 » et
 * « +221771234567 », lus comme deux numéros différents.
 *
 * Ce module ne regarde que la liste. Il compare les lignes deux à deux sur
 * trois choses — le nom, les coordonnées, ce que la personne déclare d'elle
 * (genre, tranche d'âge) — et rend un verdict gradué :
 *
 *   certain     le même nom (ou une variante) ET le même téléphone ou email ;
 *   probable    le même nom, et rien qui les sépare (l'une des lignes n'a pas
 *               de contact, ou un chiffre du numéro diffère) ;
 *   à vérifier  ce qu'aucune règle ne peut trancher : le même nom avec deux
 *               numéros différents (homonymes, ou une personne inscrite deux
 *               fois), un nom qui en contient un autre, une faute de frappe
 *               sans contact pour la confirmer.
 *
 * Les deux premiers niveaux sont réunis par défaut, le troisième non. Rien
 * n'est décidé en silence : chaque groupe est montré avec sa raison avant
 * l'import, et la personne qui importe peut changer chaque décision.
 *
 * Aucune bibliothèque n'est utilisée. Les outils génériques de
 * rapprochement (phonétique anglaise ou française, apprentissage) ne
 * connaissent ni « Ndiaye / N'Diaye / Ndiay », ni « Mouhamed / Mohamed », ni
 * les numéros sénégalais. Les règles qui comptent ici sont celles de nos
 * listes, et elles s'écrivent en quelques lignes que l'on peut lire et tester.
 */

const { normaliser } = require("./nomsDoublons");
const { agesIncompatibles, genresIncompatibles } = require("./assiduite");

/* ============================== LES NOMS ============================== */

const APOSTROPHES = /['‘’ʼ`´]/g;
const CIVILITES = new Set([
  "m", "mr", "mme", "mlle", "monsieur", "madame", "mademoiselle", "dr", "pr",
]);

/* Les mots d'un champ, sans accent, sans casse, sans ponctuation ni chiffre.
   L'apostrophe ne sépare pas : « N'Diaye » est « Ndiaye ». Le trait d'union,
   si : « Marie-Claire » est « Marie Claire ». */
function motsDe(valeur) {
  const mots = normaliser(valeur)
    .replace(APOSTROPHES, "")
    .replace(/[^a-z]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  /* « El Hadji » et « Elhadji », « Al Amine » et « Alamine » : un seul mot. */
  const joints = [];
  for (let i = 0; i < mots.length; i++) {
    if ((mots[i] === "el" || mots[i] === "al") && mots[i + 1]) {
      joints.push(mots[i] + mots[i + 1]);
      i++;
    } else {
      joints.push(mots[i]);
    }
  }
  /* Une civilité n'est pas un nom ; on la laisse si elle est seule. */
  const sans = joints.filter((m) => !CIVILITES.has(m));
  return sans.length ? sans : joints;
}

/* Les écritures d'un même prénom que la phonétique seule ne rapproche pas. */
const VARIANTES = new Map(Object.entries({
  mohamed: "mohamed", mohammed: "mohamed", mouhamed: "mohamed", mouhammed: "mohamed",
  muhamed: "mohamed", muhammed: "mohamed", muhammad: "mohamed", mohammad: "mohamed",
  mohamad: "mohamed", mouhamad: "mohamed", mouhammad: "mohamed", mahamed: "mohamed",
  mohamadou: "mohamadou", mouhamadou: "mohamadou", mouhammadou: "mohamadou",
  muhammadu: "mohamadou", mohammadou: "mohamadou", muhamadou: "mohamadou",
  elhadj: "elhadji", elhadji: "elhadji", elhaji: "elhadji", elhaj: "elhadji",
  hadj: "hadji", hadji: "hadji",
  pap: "pape", papa: "pape", pape: "pape",
  mam: "mame", maam: "mame", mame: "mame",
  oumar: "oumar", omar: "oumar", umar: "oumar",
  moustapha: "moustapha", mustapha: "moustapha", mustafa: "moustapha", moustafa: "moustapha",
  ibrahim: "ibrahima", ibrahima: "ibrahima", ibrahimma: "ibrahima",
  cheikh: "cheikh", cheick: "cheikh", cheik: "cheikh", cheickh: "cheikh", chekh: "cheikh",
  abdourahmane: "abdourahmane", abdourahman: "abdourahmane", abdurahman: "abdourahmane",
  abdourakhmane: "abdourahmane", abdrahmane: "abdourahmane",
}));

/**
 * La forme sonore d'un mot : deux écritures qui se prononcent pareil donnent
 * la même. « Ndiaye », « N'Diaye », « Ndiay » ; « Khady », « Khadi »,
 * « Kadi » ; « Fall » et « Faal » ; « Moussa » et « Musa » ; « Thiam » et
 * « Tiam » ; « Khadidiatou » et « Khadidjatou ».
 *
 * Elle ne rapproche pas deux noms différents qui se ressemblent : « Diouf »
 * et « Dioum », « Gueye » et « Gaye », « Sarr » et « Sall » gardent des formes
 * distinctes.
 */
function cleSonore(mot) {
  let m = VARIANTES.get(mot) || mot;
  m = m
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/kh/g, "k")
    .replace(/ck/g, "k")
    .replace(/qu/g, "k")
    .replace(/q/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/dj/g, "j")
    .replace(/di(?=[aeou])/g, "j")
    .replace(/ou/g, "u")
    .replace(/y/g, "i")
    .replace(/h/g, "")
    .replace(/(.)\1+/g, "$1");
  if (m.length > 3) m = m.replace(/e$/, "");
  return m;
}

/* Distance d'édition bornée, transpositions comprises (« Ndaiye » pour
   « Ndiaye » compte pour une faute, pas deux). Au-delà de « max », on ne
   cherche pas à savoir de combien. */
function distance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let avant = null;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    let minimum = i;
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, avant[j - 2] + 1);
      }
      cour[j] = v;
      if (v < minimum) minimum = v;
    }
    if (minimum > max) return max + 1;
    avant = prec;
    prec = cour;
  }
  return prec[b.length];
}

/* Une faute de frappe : une lettre (deux pour les noms longs). Les mots courts
   en sont exclus — « Awa » et « Ada », « Seck » et « Sock », « Sarr » et
   « Sall » sont des noms différents, pas des fautes. */
function fauteDeFrappe(a, b) {
  const plusCourt = Math.min(a.length, b.length);
  if (plusCourt < 5) return false;
  return distance(a, b, 2) <= (plusCourt >= 9 ? 2 : 1);
}

/* Ce qu'on retient d'une identité pour la comparer. */
function preparerNom(nom, prenom) {
  const motsNom = motsDe(nom);
  const motsPrenom = motsDe(prenom);
  const mots = [...new Set([...motsNom, ...motsPrenom])];
  return {
    mots,
    sons: mots.map(cleSonore),
    /* L'ordre ne compte pas : « Awa Niang » et « Niang Awa ». Le nom recopié
       dans la case prénom non plus : l'ensemble l'absorbe. */
    cle: mots.length ? [...mots].sort().join(" ") : null,
    /* « Ndeye Fatou » et « Ndeyefatou », « El Hadji » et « Elhadji » : les
       colonnes, écrites d'un bloc, se reconnaissent. */
    colonnes: [motsNom.join(""), motsPrenom.join("")].filter(Boolean).sort().join("|") || null,
    nomCompact: motsNom.join(""),
    prenomCompact: motsPrenom.join(""),
  };
}

/**
 * Ce que deux identités ont en commun.
 *
 *   identique   les mêmes mots, dans n'importe quel ordre et n'importe quelle
 *               colonne ;
 *   variante    autant de mots, appariés un à un, l'un au moins par sa forme
 *               sonore (« sonore ») ou par une faute de frappe (« faute ») ;
 *   incluse     l'un dit tout ce que dit l'autre, et davantage (« Awa Diop »,
 *               « Awa Marie Diop ») ;
 *   partielle   un seul mot d'un côté, retrouvé de l'autre (« Diop »,
 *               « Awa Diop ») ;
 *   approchante un mot commun, l'autre à deux lettres près (« Awa » et
 *               « Aoua ») : à ne considérer qu'avec un même contact ;
 *   differente  le reste.
 */
function relationNoms(x, y) {
  if (!x.mots.length || !y.mots.length) return { rel: "aucune" };

  const inverse = Boolean(
    x.nomCompact && x.prenomCompact && x.nomCompact !== x.prenomCompact &&
    x.nomCompact === y.prenomCompact && x.prenomCompact === y.nomCompact
  );
  if (x.cle === y.cle || (x.colonnes && x.colonnes === y.colonnes)) {
    return { rel: "identique", inverse };
  }

  const [petit, grand] = x.mots.length <= y.mots.length ? [x, y] : [y, x];
  const libres = new Set(grand.mots.map((_, j) => j));
  const prendre = (test) => (i) => {
    for (const j of libres) {
      if (test(i, j)) { libres.delete(j); return true; }
    }
    return false;
  };

  let restants = petit.mots.map((_, i) => i);
  restants = restants.filter((i) => !prendre((a, b) => petit.mots[a] === grand.mots[b])(i));
  const avantSons = restants.length;
  restants = restants.filter((i) => !prendre((a, b) => petit.sons[a] === grand.sons[b])(i));
  const sons = avantSons - restants.length;
  const exemples = [];
  const avantFautes = restants.length;
  restants = restants.filter((i) => !prendre((a, b) => {
    const ok = fauteDeFrappe(petit.mots[a], grand.mots[b]);
    if (ok) exemples.push([petit.mots[a], grand.mots[b]]);
    return ok;
  })(i));
  const fautes = avantFautes - restants.length;
  /* Une initiale : « Awa M. Diop » et « Awa Marie Diop ». */
  restants = restants.filter((i) => !prendre((a, b) =>
    petit.mots[a].length === 1 && grand.mots[b].startsWith(petit.mots[a]))(i));

  if (restants.length === 0 && fautes <= 1) {
    if (petit.mots.length === grand.mots.length) {
      return { rel: "variante", sorte: fautes ? "faute" : "sonore", sons, exemples, inverse };
    }
    if (petit.mots.length >= 2) return { rel: "incluse", sons, fautes };
    return { rel: "partielle" };
  }

  /* Un mot en commun, et un seul autre qui diffère de deux lettres au plus. */
  if (
    restants.length === 1 && fautes === 0 && petit.mots.length === grand.mots.length &&
    petit.mots.length >= 2 && libres.size === 1
  ) {
    const a = petit.mots[restants[0]];
    const b = grand.mots[[...libres][0]];
    if (Math.min(a.length, b.length) >= 3 && distance(a, b, 2) <= 2) {
      return { rel: "approchante", exemples: [[a, b]] };
    }
  }
  return { rel: "differente" };
}

/* ============================ LES CONTACTS ============================ */

/* Mobiles 70, 75, 76, 77, 78 ; fixes 30, 33 — neuf chiffres. */
function numeroSenegalais(d) {
  return /^(7[05678]\d{7}|3[03]\d{7})$/.test(d);
}

/* « 77 777 77 77 », « 77 000 00 00 », « 123456789 » : ce qu'on tape quand on
   n'a pas de numéro à donner. Le même numéro fictif sur vingt lignes ne fait
   pas vingt fois la même personne. */
function numeroFictif(d) {
  if (d.length < 7) return true;
  if (new Set(d.slice(2)).size <= 2) return true;
  return /0123456|1234567|2345678|3456789|9876543|8765432|7654321/.test(d);
}

function chiffresNumero(brut) {
  let d = String(brut || "").replace(/\D+/g, "");
  if (d.startsWith("00221")) d = d.slice(5);
  else if (d.startsWith("221") && d.length === 12) d = d.slice(3);
  /* « 0 77 123 45 67 » : un zéro de tête, à la française. */
  if (d.length === 10 && /^0[37]/.test(d)) d = d.slice(1);
  return d;
}

/**
 * Les numéros d'une cellule, sous une forme unique : neuf chiffres, sans
 * indicatif ni espace. « 77 123 45 67 », « +221 77 123 45 67 »,
 * « 00221771234567 » et « 771234567 » sont le même numéro. Une cellule peut en
 * porter deux (« 77… / 78… »), parfois collés.
 */
function telephonesDe(valeur) {
  if (valeur === null || valeur === undefined) return [];
  const parts = String(valeur).split(/[\/;,|]|\s(?:ou|et)\s/i);
  const numeros = new Set();
  for (const part of parts) {
    let d = chiffresNumero(part);
    if (!d) continue;
    /* Deux numéros sénégalais collés l'un à l'autre. */
    if (d.length === 18 && numeroSenegalais(d.slice(0, 9)) && numeroSenegalais(d.slice(9))) {
      for (const n of [d.slice(0, 9), d.slice(9)]) if (!numeroFictif(n)) numeros.add(n);
      continue;
    }
    if (!numeroFictif(d)) numeros.add(d);
  }
  return [...numeros];
}

/* Les fautes de domaine les plus courantes. On ne corrige pas l'adresse — on
   la garde telle qu'elle a été écrite —, on la compare seulement à ce qu'elle
   voulait dire. */
const DOMAINES = ["gmail.com", "yahoo.fr", "yahoo.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "icloud.com"];
const DOMAINES_ALIAS = new Map(Object.entries({
  "googlemail.com": "gmail.com", "gmail.fr": "gmail.com", "gmail.sn": "gmail.com",
  "gmail.co": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com",
  "gmail.comm": "gmail.com", "gmail.coom": "gmail.com",
}));
const DOMAINES_JETABLES = new Set([
  "yopmail.com", "yopmail.fr", "mailinator.com", "example.com", "example.org",
  "exemple.com", "exemple.fr", "test.com", "test.fr", "fake.com", "faux.com",
]);
const LOCAUX_FICTIFS = new Set([
  "test", "aaa", "aa", "a", "xxx", "xx", "x", "abc", "azerty", "qwerty", "none",
  "non", "pas", "aucun", "aucune", "neant", "inconnu", "noemail", "nomail", "na",
]);

function domaineCanonique(domaine) {
  if (DOMAINES_ALIAS.has(domaine)) return DOMAINES_ALIAS.get(domaine);
  if (DOMAINES.includes(domaine)) return domaine;
  for (const d of DOMAINES) {
    if (distance(domaine, d, 1) <= 1) return d;
  }
  return domaine;
}

/**
 * Les adresses d'une cellule, sous la forme qui les compare : sans casse ni
 * espace, le domaine ramené à ce qu'il voulait dire (« gmial.com » est
 * « gmail.com »), et pour Gmail sans les points ni le « +suffixe », que Gmail
 * ignore lui-même : « awa.niang@gmail.com » et « awaniang@gmail.com » arrivent
 * dans la même boîte.
 */
function emailsDe(valeur) {
  if (valeur === null || valeur === undefined) return [];
  const adresses = new Set();
  for (let part of String(valeur).toLowerCase().split(/[\s;,\/]+/)) {
    part = part.replace(/^mailto:/, "").replace(/^[<("']+|[>)"'.]+$/g, "");
    const m = part.match(/^([^@\s]+)@([^@\s]+\.[a-z]{2,})$/);
    if (!m) continue;
    let [, local, domaine] = m;
    domaine = domaineCanonique(domaine);
    if (DOMAINES_JETABLES.has(domaine) || LOCAUX_FICTIFS.has(local)) continue;
    if (domaine === "gmail.com") local = local.replace(/\+.*$/, "").replace(/\./g, "");
    adresses.add(`${local}@${domaine}`);
  }
  return [...adresses];
}

function emailsProches(a, b) {
  const [la, da] = a.split("@");
  const [lb, db] = b.split("@");
  /* La même boîte, un domaine différent : « awa.niang@yahoo.fr » et
     « awa.niang@yahoo.com ». */
  if (la === lb && la.length >= 5) return true;
  /* Le même domaine, une lettre de différence dans un nom assez long. */
  return da === db && Math.min(la.length, lb.length) >= 5 && distance(la, lb, 1) <= 1;
}

/**
 * Ce que disent les coordonnées de deux lignes.
 *
 *   meme    un numéro ou une adresse en commun ;
 *   proche  un chiffre ou une lettre de différence — une erreur de saisie ;
 *   oppose  toutes deux un numéro (ou toutes deux une adresse), différents ;
 *   absent  rien à comparer : une ligne sans contact ne contredit rien.
 *
 * Un contact collectif (le numéro d'une école porté par vingt enfants) ne
 * prouve rien, ni dans un sens ni dans l'autre : il est écarté.
 */
function relationContacts(x, y, collectifs) {
  const garde = (liste, coll) => liste.filter((v) => !coll.has(v));
  const tx = garde(x.tels, collectifs.tels);
  const ty = garde(y.tels, collectifs.tels);
  const mx = garde(x.mails, collectifs.mails);
  const my = garde(y.mails, collectifs.mails);

  if (tx.some((t) => ty.includes(t))) return { rel: "meme", par: "telephone" };
  if (mx.some((m) => my.includes(m))) return { rel: "meme", par: "email" };
  if (tx.some((a) => ty.some((b) => a.length === b.length && distance(a, b, 1) <= 1))) {
    return { rel: "proche", par: "telephone" };
  }
  if (mx.some((a) => my.some((b) => emailsProches(a, b)))) return { rel: "proche", par: "email" };
  if (tx.length && ty.length) return { rel: "oppose", par: "telephone" };
  if (mx.length && my.length) return { rel: "oppose", par: "email" };
  const aucun = !tx.length && !mx.length && !ty.length && !my.length;
  return { rel: "absent", aucun };
}

/* ========================= LE VERDICT D'UNE PAIRE ========================= */

function contradiction(x, y) {
  if (genresIncompatibles(x.genre, y.genre)) return "genre";
  if (agesIncompatibles(x.age, y.age)) return "age";
  return null;
}

/* La table de décision. Ligne : ce que disent les noms ; colonne : ce que
   disent les contacts. « null » : rien à signaler. La contradiction (genre
   ou âge incompatibles) dégrade le verdict quand aucun contact ne le porte. */
function niveauDe(nom, contact, contra) {
  const c = contact.rel;
  switch (nom.rel) {
    case "identique":
      if (c === "meme") return "certain";
      if (c === "proche") return "probable";
      if (c === "absent") return contra ? "a_verifier" : "probable";
      return "a_verifier"; // même nom, deux numéros : homonymes ou réinscription
    case "variante":
      if (c === "meme") return "certain";
      if (c === "proche") return "probable";
      if (c === "absent") {
        if (contra) return null;
        return nom.sorte === "sonore" ? "probable" : "a_verifier";
      }
      return null;
    case "incluse":
      if (c === "meme") return "certain";
      if (c === "proche") return "probable";
      if (c === "absent") return contra ? null : "a_verifier";
      return null;
    case "partielle":
      if (c === "meme") return "probable";
      if (c === "proche" || c === "absent") return contra ? null : "a_verifier";
      return null;
    case "approchante":
      return c === "meme" ? "a_verifier" : null;
    case "aucune":
      /* Deux lignes sans le moindre nom, avec le même contact. */
      return c === "meme" ? "probable" : null;
    default:
      return null;
  }
}

const joliMot = (m) => m.charAt(0).toUpperCase() + m.slice(1);

/* La raison, en toutes lettres : ce qui a servi de preuve. */
function raisonsDe(nom, contact, contra) {
  const r = [];
  if (nom.rel === "identique") r.push(nom.inverse ? "même nom, nom et prénom inversés" : "même nom et prénom");
  else if (nom.rel === "variante") {
    const ex = nom.exemples?.[0];
    r.push(nom.sorte === "faute" && ex
      ? `même nom à une faute près (« ${joliMot(ex[0])} » / « ${joliMot(ex[1])} »)`
      : "même nom, écrit autrement");
  } else if (nom.rel === "incluse") r.push("un nom contient l'autre (prénom composé abrégé ?)");
  else if (nom.rel === "partielle") r.push("une ligne ne porte qu'un nom, retrouvé sur l'autre");
  else if (nom.rel === "approchante") {
    const ex = nom.exemples?.[0];
    r.push(ex ? `prénoms très proches (« ${joliMot(ex[0])} » / « ${joliMot(ex[1])} »)` : "prénoms très proches");
  } else if (nom.rel === "aucune") r.push("lignes sans nom");

  const quoi = contact.par === "email" ? "email" : "téléphone";
  if (contact.rel === "meme") r.push(`même ${quoi}`);
  else if (contact.rel === "proche") r.push(contact.par === "email" ? "emails presque identiques" : "numéros à un chiffre près");
  else if (contact.rel === "oppose") r.push(contact.par === "email" ? "emails différents" : "numéros différents");
  else if (contact.aucun) r.push("aucune des deux lignes n'a de contact");
  else r.push("une seule des deux lignes a un contact");

  if (contra === "genre") r.push("genre différent");
  if (contra === "age") r.push("tranche d'âge différente");
  return r;
}

/**
 * Combien d'homonymes la liste ferait-elle apparaître par le seul hasard ?
 *
 * Sur un atelier de trente personnes, deux « Fatou Diop » sont presque
 * toujours la même, inscrite deux fois. Sur une journée de deux mille
 * inscrits, non : avec cent « Diop » et quatre-vingts « Fatou », on en attend
 * plusieurs par hasard. C'est ainsi que 170 personnes réelles avaient disparu
 * d'une liste de 1825, fondues dans leurs homonymes.
 *
 * On estime donc, pour chaque nom, le nombre de personnes qui le porteraient
 * par hasard parmi les autres lignes : le nombre de lignes, multiplié par la
 * fréquence de chacun de ses mots sur la liste (les deux lignes comparées
 * mises à part). C'est le principe des outils professionnels de
 * rapprochement d'identités — pondérer un accord par la rareté de ce sur quoi
 * on s'accorde —, réduit à ce dont nos listes ont besoin.
 *
 * Quand on en attend au moins un demi, un nom identique sans contact pour le
 * confirmer ne suffit plus à réunir d'office : la question est posée.
 */
const SEUIL_HOMONYMIE = 0.5;
function homonymesAttendus(x, frequences, n) {
  if (!frequences || n <= 2) return 0;
  let attendu = n - 2;
  for (const son of new Set(x.sons)) {
    const c = Math.max(0, (frequences.get(son) || 0) - 2);
    attendu *= c / (n - 2);
  }
  return attendu;
}

function comparer(x, y, collectifs, frequences = null, n = 0) {
  const nom = relationNoms(x, y);
  if (nom.rel === "differente") return null;
  const contact = relationContacts(x, y, collectifs);
  const contra = contradiction(x, y);
  let niveau = niveauDe(nom, contact, contra);
  if (!niveau) return null;
  const raisons = raisonsDe(nom, contact, contra);
  if (niveau === "probable" && contact.rel === "absent" && nom.rel !== "aucune") {
    const attendu = homonymesAttendus(x.mots.length <= y.mots.length ? x : y, frequences, n);
    if (attendu >= SEUIL_HOMONYMIE) {
      niveau = "a_verifier";
      raisons.push("nom très porté sur cette liste : homonymes possibles");
    }
  }
  return { niveau, nom: nom.rel, contact: contact.rel, raisons };
}

/* ============================== LA LISTE ============================== */

/* « H », « Homme », « M », « Masculin » : la même déclaration. Ce qu'on ne
   reconnaît pas reste inconnu — et un inconnu ne contredit rien. */
function genreDe(v) {
  const g = normaliser(v).replace(/[^a-z]/g, "");
  if (["h", "m", "homme", "male", "masculin", "garcon"].includes(g)) return "H";
  if (["f", "femme", "female", "feminin", "fille"].includes(g)) return "F";
  return null;
}

/**
 * Une ligne, prête à être comparée.
 * @param {{nom, prenom, email, telephone, genre, ageRange|age}} l
 */
function preparer(l) {
  return {
    ...preparerNom(l.nom, l.prenom),
    tels: telephonesDe(l.telephone),
    mails: emailsDe(l.email),
    genre: l.normalizedGender !== undefined ? l.normalizedGender || null : genreDe(l.genre),
    age: l.ageRange ?? l.age_range ?? l.age ?? null,
  };
}

const SEUIL_COLLECTIF = 3;

/* Les contacts portés par au moins trois personnes différentes de la liste :
   le téléphone d'une école, l'adresse d'un parent pour ses enfants. Ils ne
   servent plus de preuve. Les noms compatibles comptent pour une personne —
   sans quoi deux orthographes d'un prénom suffiraient à rendre collectif le
   numéro de quelqu'un. */
function contactsCollectifs(fiches) {
  const parCle = new Map();
  fiches.forEach((f, i) => {
    if (!f.mots.length) return;
    for (const t of f.tels) (parCle.get(`t:${t}`) || parCle.set(`t:${t}`, []).get(`t:${t}`)).push(i);
    for (const m of f.mails) (parCle.get(`m:${m}`) || parCle.set(`m:${m}`, []).get(`m:${m}`)).push(i);
  });
  const collectifs = { tels: new Set(), mails: new Set() };
  for (const [cle, indices] of parCle) {
    if (indices.length < SEUIL_COLLECTIF) continue;
    const groupes = [];
    for (const i of indices) {
      const g = groupes.find((membres) => membres.some((j) => {
        const rel = relationNoms(fiches[i], fiches[j]).rel;
        return rel !== "differente" && rel !== "approchante";
      }));
      if (g) g.push(i);
      else groupes.push([i]);
    }
    if (groupes.length >= SEUIL_COLLECTIF) {
      (cle.startsWith("t:") ? collectifs.tels : collectifs.mails).add(cle.slice(2));
    }
  }
  return collectifs;
}

/* Ensembles disjoints, avec la liste des membres de chaque racine. */
function creerUnion(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const membres = new Map(parent.map((i) => [i, [i]]));
  const racine = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  return {
    racine,
    membres: (i) => membres.get(racine(i)),
    unir(i, j) {
      const ri = racine(i), rj = racine(j);
      if (ri === rj) return;
      const [garde, absorbe] = ri < rj ? [ri, rj] : [rj, ri];
      parent[absorbe] = garde;
      membres.set(garde, [...membres.get(garde), ...membres.get(absorbe)].sort((a, b) => a - b));
      membres.delete(absorbe);
    },
  };
}

const RANG = { certain: 0, probable: 1, a_verifier: 2 };
const TAILLE_MAX_BLOC = 1500;

/**
 * Cherche les doublons d'une liste.
 *
 * @param {Array} lignes  { nom, prenom, email, telephone, genre, ageRange }
 * @returns {{ groupes: Array, resume: object }}
 *   chaque groupe : { id, niveau, defaut, lignes (indices dans « lignes »),
 *   cotes (pour « à vérifier » : les deux personnes mises en regard),
 *   raisons }.
 */
function analyserDoublons(lignes) {
  const fiches = (lignes || []).map(preparer);
  const n = fiches.length;
  const collectifs = contactsCollectifs(fiches);
  /* Sur combien de lignes chaque mot (sous sa forme sonore) apparaît. */
  const frequences = new Map();
  for (const f of fiches) {
    for (const s of new Set(f.sons)) frequences.set(s, (frequences.get(s) || 0) + 1);
  }

  /* On ne compare que les lignes qui partagent quelque chose : un son de nom,
     un numéro, une adresse, ou le nom d'une adresse. C'est ce qui permet
     d'analyser une liste de deux mille lignes en un instant. */
  const blocs = new Map();
  const ranger = (cle, i) => {
    if (!blocs.has(cle)) blocs.set(cle, []);
    blocs.get(cle).push(i);
  };
  fiches.forEach((f, i) => {
    for (const s of new Set(f.sons)) ranger(`s:${s}`, i);
    for (const t of f.tels) {
      ranger(`t:${t}`, i);
      ranger(`td:${t.slice(0, 5)}`, i);
      ranger(`tf:${t.slice(-5)}`, i);
    }
    for (const m of f.mails) {
      ranger(`m:${m}`, i);
      const local = m.split("@")[0];
      if (local.length >= 5) ranger(`l:${local}`, i);
    }
  });

  const vues = new Set();
  const paires = [];
  for (const indices of blocs.values()) {
    if (indices.length < 2 || indices.length > TAILLE_MAX_BLOC) continue;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const i = Math.min(indices[a], indices[b]);
        const j = Math.max(indices[a], indices[b]);
        if (i === j) continue;
        const cle = i * n + j;
        if (vues.has(cle)) continue;
        vues.add(cle);
        const verdict = comparer(fiches[i], fiches[j], collectifs, frequences, n);
        if (verdict) paires.push({ i, j, ...verdict });
      }
    }
  }

  /* « Diop » seul ne se rattache à « Awa Diop » que s'il n'y a qu'une
     personne de ce nom sur la liste : avec trois « … Diop », on ne sait pas
     laquelle, et le signaler trois fois ne servirait à rien. */
  const partielles = new Map();
  for (const p of paires) {
    if (p.nom !== "partielle") continue;
    const seul = fiches[p.i].mots.length === 1 ? p.i : p.j;
    partielles.set(seul, (partielles.get(seul) || 0) + 1);
  }
  const retenues = paires.filter((p) => {
    if (p.nom !== "partielle") return true;
    const seul = fiches[p.i].mots.length === 1 ? p.i : p.j;
    return partielles.get(seul) === 1;
  });

  /* Les réunions, des plus sûres aux moins sûres. Une réunion ne se fait pas
     si elle mettait ensemble deux lignes que tout oppose : « Awa Niang » sans
     numéro ressemble autant à « Awa Niang 77… » qu'à « Awa Niang 78… », mais
     ces deux-là ne sont pas la même personne — on ne la donne à aucune des
     deux, on pose la question. */
  retenues.sort((a, b) => RANG[a.niveau] - RANG[b.niveau] || a.i - b.i || a.j - b.j);
  const union = creerUnion(n);
  const niveauGroupe = new Map();  // racine → niveau le plus faible des liens
  const raisonsGroupe = new Map(); // racine → raisons
  const aVerifier = [];

  const sopposent = (groupeA, groupeB) => groupeA.some((a) => groupeB.some((b) =>
    relationContacts(fiches[a], fiches[b], collectifs).rel === "oppose" ||
    (contradiction(fiches[a], fiches[b]) &&
      relationContacts(fiches[a], fiches[b], collectifs).rel !== "meme")
  ));

  for (const p of retenues) {
    if (p.niveau === "a_verifier") { aVerifier.push(p); continue; }
    const ri = union.racine(p.i), rj = union.racine(p.j);
    if (ri === rj) continue;
    if (sopposent(union.membres(p.i), union.membres(p.j))) {
      aVerifier.push({
        ...p,
        niveau: "a_verifier",
        raisons: [...p.raisons, "ressemble aussi à une autre ligne qui s'en distingue"],
      });
      continue;
    }
    const niveaux = [niveauGroupe.get(ri), niveauGroupe.get(rj), p.niveau].filter(Boolean);
    const raisons = new Set([...(raisonsGroupe.get(ri) || []), ...(raisonsGroupe.get(rj) || []), ...p.raisons]);
    union.unir(p.i, p.j);
    const r = union.racine(p.i);
    niveauGroupe.set(r, niveaux.sort((a, b) => RANG[b] - RANG[a])[0]);
    raisonsGroupe.set(r, raisons);
  }

  const groupes = [];
  for (const [racine, niveau] of niveauGroupe) {
    if (union.racine(racine) !== racine) continue;
    const membres = union.membres(racine);
    if (membres.length < 2) continue;
    groupes.push({
      niveau,
      defaut: "fusionner",
      lignes: membres,
      raisons: [...raisonsGroupe.get(racine)].slice(0, 5),
    });
  }

  /* Les questions. Les personnes qu'une même hésitation relie forment une
     seule question : quatre « Aissatou Diallo » aux quatre numéros différents
     se regardent ensemble, pas en six paires. */
  const liens = creerUnion(n);
  const raisonsQuestion = new Map();
  for (const p of aVerifier) {
    const ri = union.racine(p.i), rj = union.racine(p.j);
    if (ri === rj) continue;
    const a = liens.racine(ri), b = liens.racine(rj);
    const raisons = new Set([
      ...(raisonsQuestion.get(a) || []),
      ...(raisonsQuestion.get(b) || []),
      ...p.raisons,
    ]);
    liens.unir(ri, rj);
    raisonsQuestion.set(liens.racine(ri), raisons);
  }
  for (const [r, raisons] of raisonsQuestion) {
    if (liens.racine(r) !== r) continue;
    /* Chaque côté est une personne déjà constituée : une ligne seule, ou un
       groupe que l'analyse a réuni. */
    const cotes = liens.membres(r)
      .filter((i) => union.racine(i) === i)
      .map((i) => union.membres(i));
    if (cotes.length < 2) continue;
    groupes.push({
      niveau: "a_verifier",
      defaut: "separer",
      cotes,
      lignes: cotes.flat().sort((x, y) => x - y),
      raisons: [...raisons].slice(0, 5),
    });
  }

  groupes.sort((a, b) => a.lignes[0] - b.lignes[0] || RANG[a.niveau] - RANG[b.niveau]);
  groupes.forEach((g, k) => { g.id = `g${k + 1}`; });

  return {
    groupes,
    resume: {
      groupes: groupes.length,
      certains: groupes.filter((g) => g.niveau === "certain").length,
      probables: groupes.filter((g) => g.niveau === "probable").length,
      a_verifier: groupes.filter((g) => g.niveau === "a_verifier").length,
      contacts_collectifs: collectifs.tels.size + collectifs.mails.size,
    },
  };
}

/**
 * Les personnes du fichier, une fois les décisions prises : chaque ensemble
 * de lignes à réunir donne une personne, chaque autre ligne la sienne.
 *
 * @param {number} n           nombre de lignes
 * @param {Array<Array<number>>} fusions  les ensembles de lignes à réunir
 * @returns {Array<Array<number>>} les lignes de chaque personne, dans l'ordre
 */
function regrouper(n, fusions) {
  const union = creerUnion(n);
  for (const ensemble of fusions || []) {
    const valides = (ensemble || []).filter((i) => Number.isInteger(i) && i >= 0 && i < n);
    for (let k = 1; k < valides.length; k++) union.unir(valides[0], valides[k]);
  }
  const vus = new Set();
  const personnes = [];
  for (let i = 0; i < n; i++) {
    const r = union.racine(i);
    if (vus.has(r)) continue;
    vus.add(r);
    personnes.push(union.membres(i));
  }
  return personnes;
}

module.exports = {
  analyserDoublons,
  regrouper,
  preparer,
  comparer,
  relationNoms,
  relationContacts,
  contactsCollectifs,
  telephonesDe,
  emailsDe,
  cleSonore,
  motsDe,
};
