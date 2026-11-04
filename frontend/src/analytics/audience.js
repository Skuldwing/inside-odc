/**
 * La mesure d'audience, côté navigateur.
 *
 * Elle ne tourne que sur deux écrans : la page d'accueil publique et l'espace
 * des bénéficiaires. Jamais sur la plateforme interne.
 *
 *
 * CE QU'ELLE N'ENVOIE PAS
 *
 * Aucun identifiant de personne. Pas de cookie. Pas d'empreinte de navigateur.
 * Rien qui permette de relier deux visites entre elles.
 *
 * Deux valeurs seulement sont gardées dans le navigateur :
 *
 *   — un numéro tiré au hasard, dans `sessionStorage`, qui identifie la visite
 *     en cours et meurt avec l'onglet. C'est le numéro d'un passage, pas celui
 *     d'une personne ;
 *   — une date, dans `localStorage` : celle du dernier passage. Elle sert à
 *     dire « c'est mon premier passage aujourd'hui », ce qui permet de compter
 *     les visiteurs uniques du jour sans stocker le moindre identifiant.
 *
 * Un visiteur qui vide son navigateur efface donc tout ce qui le concerne, et
 * ce tout se résume à une date.
 *
 *
 * LES MINUTES PASSÉES
 *
 * On compte le temps de présence réelle, pas le temps d'ouverture de l'onglet.
 * Le compteur s'arrête quand l'onglet passe à l'arrière-plan, et quand plus
 * rien ne bouge pendant une minute. Sans ces deux règles, un onglet oublié
 * toute la nuit vaudrait huit heures d'engagement et rendrait la moyenne
 * mensongère.
 *
 *
 * ELLE NE DOIT JAMAIS CASSER LA PAGE
 *
 * Ce code s'exécute sur la page d'accueil publique, c'est-à-dire sur la
 * première impression du centre. Tout y est enveloppé : un `sessionStorage`
 * refusé en navigation privée, un `IntersectionObserver` absent, une API
 * injoignable ne produisent qu'une mesure manquante, jamais un écran blanc.
 */

const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";
const URL_SIGNAL = `${BASE.replace(/\/+$/, "")}/audience/signal`;

/* Toutes les vingt-cinq secondes de présence effective. Assez court pour
   qu'une visite interrompue brutalement — onglet tué, réseau coupé — ne perde
   pas plus d'une demi-minute, assez long pour ne pas transformer la mesure en
   bavardage. */
const PALIER_SECONDES = 25;

/* Au-delà d'une minute sans le moindre geste, on considère que la page est
   ouverte mais que personne ne la lit. */
const INACTIVITE_SECONDES = 60;

/* ===== PETITS OUTILS, TOUS SILENCIEUX EN CAS DE REFUS ===== */

function lire(magasin, cle) {
  try {
    return window[magasin]?.getItem(cle) ?? null;
  } catch {
    return null;
  }
}

function ecrire(magasin, cle, valeur) {
  try {
    window[magasin]?.setItem(cle, valeur);
  } catch {
    /* navigation privée, stockage plein, stockage bloqué : on mesure sans. */
  }
}

function numeroAuHasard() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const octets = new Uint8Array(16);
    window.crypto.getRandomValues(octets);
    return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
  } catch {
    /* Dernier recours : suffisant pour distinguer deux visites, et il n'y a
       rien à protéger derrière ce numéro. */
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.slice(0, 32);
  }
}

/* D'où vient le visiteur. On n'envoie que le nom d'hôte, jamais l'adresse
   complète : le chemin d'une page de provenance peut contenir une recherche
   ou un identifiant. Le serveur le regroupe ensuite par grandes familles. */
function provenance() {
  try {
    const ref = document.referrer;
    if (!ref) return "direct";
    const hote = new URL(ref).hostname;
    if (hote === window.location.hostname) return "interne";
    return hote;
  } catch {
    return "direct";
  }
}

/* L'appareil est déduit de la largeur de la fenêtre, pas de l'agent
   utilisateur : la largeur répond à la question posée — « lisent-ils sur
   téléphone ? » — sans rien révéler du modèle ni de la version. */
function appareil() {
  try {
    const l = window.innerWidth || 1024;
    if (l < 640) return "mobile";
    if (l < 1024) return "tablette";
    return "ordinateur";
  } catch {
    return null;
  }
}

/**
 * Démarrer la mesure pour un périmètre. Renvoie la fonction d'arrêt.
 *
 * @param {"accueil"|"espace"} espace
 */
export function suivreAudience(espace) {
  if (espace !== "accueil" && espace !== "espace") return () => {};
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  let arrete = false;

  /* ===== IDENTITÉ DE LA VISITE ===== */
  const cleVisite = `audience.visite.${espace}`;
  let visite = lire("sessionStorage", cleVisite);
  const debutant = !visite;
  if (!visite) {
    visite = numeroAuHasard();
    ecrire("sessionStorage", cleVisite, visite);
  }

  /* « Premier passage du jour » et « jamais venu » : deux booléens déduits
     d'une seule date. On ne les calcule qu'à l'ouverture d'une visite, et on
     met la date à jour aussitôt — sinon deux onglets ouverts en même temps se
     déclareraient tous les deux premiers. */
  const cleJour = "audience.jour";
  let premiereDuJour = false;
  let nouveau = false;
  if (debutant) {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const dernier = lire("localStorage", cleJour);
    nouveau = !dernier;
    premiereDuJour = dernier !== aujourdhui;
    ecrire("localStorage", cleJour, aujourdhui);
  }

  /* Les sections déjà annoncées, pour toute la visite et non pour ce seul
     chargement de page. Un rechargement crée une nouvelle instance de ce
     fichier, avec un ensemble vide : sans cette mémoire, le visiteur qui
     recharge et redescend ferait compter deux fois les mêmes sections, et
     l'écran afficherait « 130 % des visites ont atteint le pied de page ». */
  const cleSections = `audience.sections.${espace}`;
  const dejaAnnoncees = new Set(
    (lire("sessionStorage", cleSections) || "").split(",").filter(Boolean)
  );

  /* ===== CE QUI ATTEND D'ÊTRE ENVOYÉ ===== */
  let secondes = 0;
  /* Premier signal de ce chargement de page. À ne pas confondre avec
     « debutant », qui dit si la VISITE commence : un rechargement d'onglet est
     une page de plus dans la même visite. Les confondre faisait recompter la
     provenance et l'appareil à chaque rechargement, et ces deux tableaux
     dépassaient alors le nombre de visites. */
  let premierSignal = true;
  const sections = new Set();
  const clics = [];

  function corpsDuSignal() {
    const corps = { visite, espace, secondes };
    if (premierSignal) {
      /* Une page ouverte de plus, rechargement compris. */
      corps.vues = 1;
      if (debutant) {
        /* Et celle-ci ouvre la visite : ces quatre valeurs ne se prennent
           qu'une fois, sinon un visiteur vaudrait autant de visiteurs que de
           pages ouvertes. */
        corps.debut = true;
        corps.premiere_du_jour = premiereDuJour;
        corps.nouveau = nouveau;
        corps.source = provenance();
        corps.appareil = appareil();
      }
    }
    if (sections.size) corps.sections = [...sections];
    if (clics.length) corps.clics = [...clics];
    return corps;
  }

  /**
   * Envoyer, et ne vider les compteurs que si l'envoi a bien été pris en
   * charge. Un `sendBeacon` qui refuse — file pleine — doit laisser les
   * secondes en place pour le prochain essai, sinon la mesure se perd en
   * silence.
   *
   * Le corps part en `text/plain` : c'est le seul type qu'un navigateur
   * envoie à une autre origine sans demander la permission d'abord. En JSON,
   * chaque signal serait précédé d'un appel OPTIONS.
   */
  function envoyer({ enQuittant = false } = {}) {
    if (!premierSignal && !secondes && !sections.size && !clics.length) return;

    const corps = JSON.stringify(corpsDuSignal());
    const vider = () => {
      premierSignal = false;
      secondes = 0;
      /* Les sections ne sont retenues comme annoncées qu'une fois l'envoi pris
         en charge : si l'envoi échoue, elles repartiront au prochain signal. */
      for (const s of sections) dejaAnnoncees.add(s);
      if (sections.size) ecrire("sessionStorage", cleSections, [...dejaAnnoncees].join(","));
      sections.clear();
      clics.length = 0;
    };

    try {
      if (enQuittant && navigator.sendBeacon) {
        const pris = navigator.sendBeacon(
          URL_SIGNAL,
          new Blob([corps], { type: "text/plain;charset=UTF-8" })
        );
        if (pris) vider();
        return;
      }

      /* « keepalive » pour que l'appel survive à une navigation déclenchée
         juste après — un clic sur « Mon espace », typiquement. */
      fetch(URL_SIGNAL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: corps,
        credentials: "omit",
        keepalive: true,
        mode: "cors",
      }).catch(() => {});
      vider();
    } catch {
      /* API injoignable, hors ligne : on garde les compteurs pour plus tard. */
    }
  }

  /* ===== LE TEMPS DE PRÉSENCE ===== */
  let dernierGeste = Date.now();
  const gestes = ["pointerdown", "keydown", "scroll", "touchstart", "pointermove", "focus"];
  const noterGeste = () => {
    dernierGeste = Date.now();
  };
  gestes.forEach((g) =>
    window.addEventListener(g, noterGeste, { passive: true, capture: true })
  );

  const battement = window.setInterval(() => {
    if (arrete) return;
    if (document.visibilityState !== "visible") return;
    if (Date.now() - dernierGeste > INACTIVITE_SECONDES * 1000) return;
    secondes += 1;
    if (secondes >= PALIER_SECONDES) envoyer();
  }, 1000);

  /* ===== JUSQU'OÙ ILS DESCENDENT (page d'accueil) ===== */
  let observateur = null;
  if (espace === "accueil" && typeof IntersectionObserver === "function") {
    try {
      observateur = new IntersectionObserver(
        (entrees) => {
          for (const e of entrees) {
            if (!e.isIntersecting) continue;
            const id = e.target.getAttribute("id");
            if (id && !dejaAnnoncees.has(id)) sections.add(id);
            /* Une section atteinte ne se reprend pas : c'est « il y est
               arrivé », pas « il l'a regardée douze fois ». */
            observateur.unobserve(e.target);
          }
        },
        /* Quarante pour cent visible : un simple frôlement au passage du
           défilement rapide ne compte pas comme une section atteinte. */
        { threshold: 0.4 }
      );
      document.querySelectorAll("section[id]").forEach((s) => observateur.observe(s));
    } catch {
      observateur = null;
    }
  }

  /* ===== CE SUR QUOI ILS CLIQUENT (page d'accueil) ===== */
  /* Un seul écouteur délégué, et les noms vivent dans le gabarit en attribut
     « data-audience » : ajouter un bouton à suivre ne demande pas de toucher
     à ce fichier. Le serveur n'accepte que les noms de sa liste. */
  const surClic = (e) => {
    try {
      const cible = e.target?.closest?.("[data-audience]");
      const nom = cible?.getAttribute("data-audience");
      if (!nom || clics.length >= 16) return;
      clics.push(nom);
      /* Tout de suite : le clic emmène souvent ailleurs, et attendre le
         prochain palier perdrait l'information. */
      envoyer({ enQuittant: true });
    } catch {
      /* un clic non mesuré n'est pas un incident */
    }
  };
  if (espace === "accueil") document.addEventListener("click", surClic, { capture: true });

  /* ===== DÉPART ===== */
  const surVisibilite = () => {
    if (document.visibilityState === "hidden") envoyer({ enQuittant: true });
  };
  /* « pagehide » et non « unload » : le second empêche la mise en cache de la
     page par le navigateur, et Safari ne le déclenche pas de façon fiable. */
  const surSortie = () => envoyer({ enQuittant: true });
  document.addEventListener("visibilitychange", surVisibilite);
  window.addEventListener("pagehide", surSortie);

  /* L'ouverture part immédiatement. Sans cela, une visite de trois secondes —
     exactement celle qu'on veut pouvoir compter — ne laisserait aucune trace. */
  envoyer();

  return () => {
    if (arrete) return;
    arrete = true;
    window.clearInterval(battement);
    gestes.forEach((g) => window.removeEventListener(g, noterGeste, { capture: true }));
    document.removeEventListener("visibilitychange", surVisibilite);
    window.removeEventListener("pagehide", surSortie);
    if (espace === "accueil") document.removeEventListener("click", surClic, { capture: true });
    observateur?.disconnect?.();
    envoyer({ enQuittant: true });
  };
}

export default suivreAudience;
