import { HERO, MANIFESTE, POLES, PUBLICS, PLATEFORME, FINAL } from "./src/content/centre.js";
import { IDENTITE } from "./src/config/identite.js";

/**
 * Écrire la page d'accueil dans le document, en clair.
 *
 *
 * LE PROBLÈME
 *
 * Le site est une application rendue par le navigateur. Le document servi est
 * une coquille : un « <div id="root"></div> » vide, et du JavaScript qui le
 * remplit. Un visiteur ne voit pas la différence. Un robot qui n'exécute pas
 * de JavaScript, si : il reçoit zéro mot, aucun titre, aucune structure.
 *
 * Ce n'est pas théorique. Ne s'exécutent pas :
 *
 *   — WhatsApp, Facebook, LinkedIn et X quand ils composent l'aperçu d'un lien
 *     partagé. C'est par là qu'arrive l'essentiel du trafic de ce site, et un
 *     lien partagé n'affichait donc rien — ni titre, ni image, ni résumé ;
 *   — la plupart des robots des moteurs de recherche par intelligence
 *     artificielle, qui lisent le document brut ;
 *   — les outils d'analyse SEO, d'où un score mesuré de 17 sur 100 alors que
 *     la page rendue porte bien un titre de niveau 1, quatre cent dix-neuf
 *     mots et une hiérarchie de titres correcte.
 *
 * Google, lui, exécute le JavaScript. Mais il est le seul, il le fait plus
 * tard que le reste, et il n'est plus le seul chemin vers un site.
 *
 *
 * CE QUE FAIT CE GREFFON
 *
 * Il lit « src/content/centre.js » — la source unique des textes du centre —
 * et dépose leur équivalent HTML dans le document au moment de la
 * construction. Pas de navigateur sans écran, pas de rendu côté serveur, pas
 * de dépendance nouvelle : une lecture de données et une chaîne de caractères.
 *
 * Les deux versions ne peuvent pas diverger, puisqu'il n'y a qu'un texte.
 * Corriger la page d'accueil, c'est corriger ce fichier de contenu, et les
 * deux suivent.
 *
 *
 * CE QUE VOIT UN VISITEUR
 *
 * React remplace ce bloc dès qu'il démarre. Entre-temps — une seconde ou deux
 * sur une connexion mobile — c'est une version sobre de la même page qui
 * s'affiche, au lieu d'un écran blanc. Les styles sont écrits dans les
 * attributs, pour tenir même si la feuille de style n'est pas encore arrivée.
 *
 * Et comme le document est le même pour toutes les adresses du site, un petit
 * script masque ce bloc dès qu'on n'est pas sur la racine : sans lui, un
 * membre de l'équipe ouvrant son tableau de bord verrait passer la page
 * d'accueil avant son écran.
 */

const ORANGE = "#FF7900";
const ENCRE = "#12100E";

/* Un texte qui va dans du HTML doit être échappé, même quand il vient de nous :
   une apostrophe typographique passe, mais une esperluette dans un futur
   intitulé casserait le document en silence. */
function echapper(texte) {
  return String(texte)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function carte({ titre, texte }) {
  return `<li style="margin:0 0 18px;padding:0;list-style:none">
      <h3 style="margin:0 0 4px;font-size:17px;line-height:1.3;color:${ENCRE}">${echapper(titre)}</h3>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#4a4a4a">${echapper(texte)}</p>
    </li>`;
}

function bloc(section) {
  const chapo = section.chapo
    ? `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#3a3a3a">${echapper(section.chapo)}</p>`
    : "";
  return `<section style="margin:0 0 40px">
      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:${ENCRE}">${echapper(section.titre)}</h2>
      ${chapo}<ul style="margin:0;padding:0">${section.items.map(carte).join("")}</ul>
    </section>`;
}

export function accueilStatique() {
  return {
    name: "inside-odc-accueil-statique",

    transformIndexHtml(html) {
      const contenu = `
  <div id="accueil-statique" style="max-width:720px;margin:0 auto;padding:40px 20px 64px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${ENCRE}">
    <p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${ORANGE};font-weight:600">${echapper(HERO.surtitre)}</p>
    <h1 style="margin:0 0 16px;font-size:34px;line-height:1.15;color:${ENCRE}">${echapper(HERO.titre.join(" "))}</h1>
    <p style="margin:0 0 32px;font-size:18px;line-height:1.6;color:#3a3a3a">${echapper(HERO.chapo)}</p>

    <section style="margin:0 0 40px">
      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:${ENCRE}">${echapper(MANIFESTE.surtitre)}</h2>
      <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#3a3a3a"><strong>${echapper(MANIFESTE.nom)}</strong>${echapper(MANIFESTE.texte)}</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#6a6a6a">${echapper(MANIFESTE.note)}</p>
    </section>

    ${bloc(POLES)}
    ${bloc(PUBLICS)}

    <section style="margin:0 0 40px">
      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:${ENCRE}">${echapper(PLATEFORME.titre)}</h2>
      <p style="margin:0 0 10px;font-size:16px;line-height:1.65;color:#3a3a3a">${echapper(PLATEFORME.texte)}</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#6a6a6a">${echapper(PLATEFORME.acces)}</p>
    </section>

    <section style="margin:0 0 40px">
      <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:${ENCRE}">${echapper(FINAL.titre)}</h2>
      <p style="margin:0;font-size:16px;line-height:1.65;color:#3a3a3a">${echapper(FINAL.texte)}</p>
    </section>

    <nav style="padding-top:24px;border-top:1px solid #e4e4e4;font-size:15px;line-height:2">
      <a href="/espace" style="color:${ORANGE};margin-right:20px">Mon espace bénéficiaire</a>
      <a href="/mentions-legales" style="color:#4a4a4a;margin-right:20px">Mentions légales</a>
      <a href="mailto:${IDENTITE.contact}" style="color:#4a4a4a">${IDENTITE.contact}</a>
    </nav>
  </div>`;

      const script = `
  <script>
    /* Le document est le même pour toutes les adresses du site. Ce bloc ne
       décrit que la page d'accueil : ailleurs, il est retiré avant le premier
       affichage, pour qu'un membre de l'équipe ne voie pas passer la vitrine
       avant son tableau de bord. Un robot sans JavaScript, lui, le garde — et
       c'est tout l'intérêt. */
    (function () {
      if (location.pathname !== "/") {
        var bloc = document.getElementById("accueil-statique");
        if (bloc) bloc.parentNode.removeChild(bloc);
      }
    })();
  </script>`;

      /* Remplacement exact plutôt qu'expression régulière permissive : si la
         coquille change de forme, mieux vaut que la construction échoue
         bruyamment ici que de livrer un document sans contenu statique sans
         que personne ne s'en aperçoive. */
      const cible = '<div id="root"></div>';
      if (!html.includes(cible)) {
        throw new Error(
          `[accueil-statique] « ${cible} » est introuvable dans index.html : ` +
            "la page d'accueil statique n'a pas pu être écrite."
        );
      }

      return html.replace(cible, `<div id="root">${contenu}\n    </div>${script}`);
    },
  };
}

export default accueilStatique;
