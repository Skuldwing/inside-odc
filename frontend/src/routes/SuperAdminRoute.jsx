import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

/* Le cran au-dessus d'administrateur.
 *
 * Qui n'est pas Admin + est renvoyé au tableau de bord, exactement comme un non
 * administrateur devant une page d'administration — pas de message, pas de
 * « accès refusé » : la page n'existe pas pour lui.
 *
 * Ce garde ne protège rien. Le code de la page part dans le lot téléchargé par
 * tout le monde, et un navigateur peut toujours appeler l'adresse à la main. La
 * vraie protection est au serveur, qui relit le drapeau en base à chaque appel
 * et répond « introuvable ». Celui-ci évite simplement d'afficher une page vide
 * à quelqu'un qui n'en obtiendra jamais les données.
 */
export default function SuperAdminRoute({ children }) {
  const { isSuperAdmin, isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500">
        Vérification session...
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return children;
}
