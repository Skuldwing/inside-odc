import { useEffect } from "react";
import { IDENTITE } from "../config/identite";

/**
 * Le titre et la description de chaque page.
 *
 * Toutes les adresses du site servent le même document : l'application est
 * rendue par le navigateur, et l'hébergement renvoie « index.html » pour
 * n'importe quel chemin. Sans ce qui suit, chaque page du site s'annonçait
 * donc « Inside ODC » — le même titre dans l'onglet, le même titre dans un
 * favori, le même titre dans un résultat de recherche.
 *
 * Trois pages seulement ont besoin d'être trouvées : l'accueil, l'espace des
 * bénéficiaires et les mentions légales. Tout le reste est un espace de
 * travail, et se déclare explicitement « à ne pas indexer » : le fichier
 * robots.txt le dit déjà, mais un robot qui atteint l'adresse par un lien
 * n'est pas tenu de l'avoir lu, alors que la balise voyage avec la page.
 */

const SITE = IDENTITE.siteUrl.replace(/\/+$/, "");

/* Une description utile se lit comme une phrase, pas comme une liste de mots
   clés : c'est elle qui s'affiche sous le lien dans les résultats, et c'est
   elle qui décide du clic. Entre cent et cent soixante caractères — en deçà
   les moteurs la jugent pauvre, au-delà ils la coupent. */
export const PAGES = {
  accueil: {
    chemin: "/",
    titre: "Inside ODC Sénégal — se former aux métiers du numérique",
    description:
      "Formation, fabrication et accompagnement de projets dans un centre numérique au Sénégal. Découvrez les quatre pôles, les publics accueillis et la plateforme qui suit les activités.",
  },
  espace: {
    chemin: "/espace",
    titre: "Mon espace bénéficiaire — Inside ODC Sénégal",
    description:
      "Retrouvez les formations que vous avez suivies au centre et téléchargez vos attestations de participation. Sans mot de passe : un lien d'accès est envoyé à votre adresse électronique.",
  },
  mentions: {
    chemin: "/mentions-legales",
    titre: "Mentions légales — Inside ODC Sénégal",
    description:
      "Éditeur du site, hébergement, traitement des données personnelles, courriers électroniques et mesure de fréquentation de la plateforme Inside ODC Sénégal.",
  },
  /* L'espace de travail. Un seul jeu de valeurs pour toutes ses pages : leur
     titre exact n'intéresse personne hors de l'équipe, et le but est qu'elles
     n'apparaissent nulle part. */
  prive: {
    chemin: null,
    titre: "Inside ODC — Centre de pilotage",
    description: null,
    indexable: false,
  },
};

/* ===== POSER LES BALISES =====
 * Chaque balise est retrouvée par son sélecteur et modifiée sur place, ou
 * créée si elle manque. On n'en empile donc jamais deux, quel que soit le
 * nombre de changements de page. */

function baliseMeta(selecteur, attributs) {
  if (typeof document === "undefined") return null;
  let balise = document.head.querySelector(selecteur);
  if (!balise) {
    balise = document.createElement("meta");
    for (const [c, v] of Object.entries(attributs)) balise.setAttribute(c, v);
    document.head.appendChild(balise);
  }
  return balise;
}

function poserContenu(selecteur, attributs, contenu) {
  if (contenu == null) {
    document.head.querySelector(selecteur)?.remove();
    return;
  }
  baliseMeta(selecteur, attributs)?.setAttribute("content", contenu);
}

function poserCanonique(url) {
  if (typeof document === "undefined") return;
  let lien = document.head.querySelector('link[rel="canonical"]');
  if (!url) {
    lien?.remove();
    return;
  }
  if (!lien) {
    lien = document.createElement("link");
    lien.setAttribute("rel", "canonical");
    document.head.appendChild(lien);
  }
  lien.setAttribute("href", url);
}

/**
 * Déclarer ce qu'est la page en cours.
 *
 * @param {object} page une entrée de PAGES, ou un objet de même forme.
 */
export function appliquerMeta(page) {
  if (typeof document === "undefined" || !page) return;

  const indexable = page.indexable !== false;
  const canonique = page.chemin ? `${SITE}${page.chemin === "/" ? "/" : page.chemin}` : null;

  document.title = page.titre || IDENTITE.nomCourt;
  poserContenu('meta[name="description"]', { name: "description" }, page.description);

  /* « noindex » sur l'espace de travail, et « follow » tout de même : les
     liens d'une page non indexée restent utiles à suivre, et le contraire
     reviendrait à couper la découverte des pages publiques atteintes depuis
     l'intérieur. */
  poserContenu(
    'meta[name="robots"]',
    { name: "robots" },
    indexable ? "index, follow, max-image-preview:large" : "noindex, follow"
  );

  /* L'adresse de référence. Sans elle, les dizaines d'adresses qui servent le
     même document passent pour autant de pages en double. */
  poserCanonique(canonique);

  /* Ce que voient WhatsApp, Facebook et LinkedIn au moment du partage. Ces
     robots-là n'exécutent jamais le JavaScript : ils ne liront que les valeurs
     posées dans le document de départ. Les mettre à jour ici ne sert donc qu'à
     la cohérence de la page pour les outils qui, eux, exécutent. */
  poserContenu('meta[property="og:title"]', { property: "og:title" }, page.titre);
  poserContenu('meta[property="og:description"]', { property: "og:description" }, page.description);
  poserContenu('meta[property="og:url"]', { property: "og:url" }, canonique || SITE);
  poserContenu('meta[name="twitter:title"]', { name: "twitter:title" }, page.titre);
  poserContenu('meta[name="twitter:description"]', { name: "twitter:description" }, page.description);
}

/** Le même, en crochet React, posé au montage de la page. */
export function useMeta(page) {
  useEffect(() => {
    appliquerMeta(page);
  }, [page]);
}

export default useMeta;
