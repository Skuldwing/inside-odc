import { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

/* Initiales : « Awa Ndiaye » -> « AN ». Sans nom, on retombe sur l'email, et
   en dernier recours sur un point d'interrogation plutot qu'un carre vide. */
export function initiales(nom, email) {
  const source = (nom || "").trim() || (email || "").split("@")[0] || "";
  const mots = source.split(/[\s._-]+/).filter(Boolean);
  if (!mots.length) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[mots.length - 1][0]).toUpperCase();
}

/**
 * Photo de profil, avec repli sur les initiales.
 *
 * L'horodatage de la derniere modification est place dans l'URL : sans lui,
 * le navigateur continuerait d'afficher l'ancienne photo apres un changement,
 * puisque l'adresse serait restee la meme.
 */
export default function Avatar({
  userId,
  name,
  email,
  updatedAt,
  className = "h-9 w-9",
  textClassName = "text-sm",
}) {
  const [echec, setEchec] = useState(false);
  const affichePhoto = Boolean(userId && updatedAt && !echec);

  const base = `flex-shrink-0 rounded-xl overflow-hidden ${className}`;

  if (affichePhoto) {
    return (
      <img
        src={`${API}/profile/avatar/${userId}?v=${new Date(updatedAt).getTime()}`}
        alt={name ? `Photo de ${name}` : "Photo de profil"}
        onError={() => setEchec(true)}
        className={`${base} object-cover bg-slate-100`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${base} ${textClassName} flex items-center justify-center bg-gradient-to-br from-orange-400 to-orange-600 font-semibold text-white`}
    >
      {initiales(name, email)}
    </span>
  );
}
