import { useLocation, useNavigate } from "react-router-dom";

/**
 * Le bouton « Retour » ramène d'où l'on vient.
 *
 * Il menait toujours au même endroit : la liste des participants depuis un
 * profil, la liste des activités depuis une fiche. Ouvrir un participant
 * depuis la fiche d'une activité, puis cliquer « Retour », faisait donc
 * perdre l'activité qu'on était en train de traiter.
 *
 * La page qui ouvre une fiche dit d'où l'on vient (« retourVers ») ; la fiche
 * s'en sert pour son bouton, et retombe sur sa liste quand on y est arrivé
 * autrement (lien direct, favori, nouvel onglet).
 */
export function retourVers(chemin, libelle) {
  return { retour: { chemin, libelle } };
}

export function useRetour(cheminParDefaut, libelleParDefaut) {
  const location = useLocation();
  const navigate = useNavigate();
  const retour = location.state?.retour;
  const valide = retour && typeof retour.chemin === "string" && retour.chemin.startsWith("/");
  const chemin = valide ? retour.chemin : cheminParDefaut;
  return {
    libelle: valide && retour.libelle ? retour.libelle : libelleParDefaut,
    aller: () => navigate(chemin),
  };
}
