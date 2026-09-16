import { IDENTITE } from "../../config/identite";

/**
 * Marque de la plateforme.
 *
 * C'etait le logo Orange Digital Center / Sonatel, en PNG. La plateforme n'est
 * editee ni par Orange ni par Sonatel : afficher leur logo laissait croire le
 * contraire a tout visiteur, et a tout service de conformite verifiant un
 * expediteur. Il est remplace par une marque propre, dessinee ici.
 *
 * Le trace est un SVG plutot qu'une image : il reste net a toute taille, il
 * suit la couleur du theme, et il ne s'accompagne d'aucun fichier a versionner.
 *
 * L'interface d'appel ne change pas — variant « mark » ou « full », plus une
 * classe — pour que les six endroits qui l'affichent restent inchanges.
 */

const ORANGE = "#FF7900";

/* Le monogramme : un carre arrondi, une barre verticale et un point — la
   silhouette d'un « i » minuscule, initiale d'« Inside ». Volontairement
   geometrique : il doit rester lisible a 16 pixels, en favicon comme en
   pastille de barre laterale. */
function Monogramme({ x = 0, y = 0, taille = 40 }) {
  const e = taille / 40;
  return (
    <g transform={`translate(${x} ${y}) scale(${e})`}>
      <rect width="40" height="40" rx="11" fill={ORANGE} />
      <circle cx="20" cy="12.5" r="3.4" fill="#ffffff" />
      <rect x="16.6" y="18.5" width="6.8" height="12.5" rx="3.4" fill="#ffffff" />
    </g>
  );
}

export default function ODCLogo({
  variant = "full",
  className = "",
  title = IDENTITE.nom,
}) {
  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 40 40"
        role="img"
        aria-label={title}
        className={className}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{title}</title>
        <Monogramme />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 208 44"
      role="img"
      aria-label={title}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <Monogramme y={2} />
      <text
        x="54"
        y="22"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="19"
        fontWeight="700"
        letterSpacing="-0.4"
        fill="currentColor"
      >
        Inside
        <tspan fill={ORANGE}> ODC</tspan>
      </text>
      <text
        x="54"
        y="36"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="10.5"
        letterSpacing="2.6"
        fill="currentColor"
        opacity="0.55"
      >
        SÉNÉGAL
      </text>
    </svg>
  );
}
