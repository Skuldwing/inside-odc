import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import PageLoader from "../components/PageLoader";

export default function PrivateRoute({ children }) {
  const { isAuthenticated, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return <PageLoader label="Vérification de la session..." />;
  }

  if (!isAuthenticated) {
    /* L'adresse demandee est transmise a l'ecran de connexion : quelqu'un qui
       ouvre un lien vers une activite precise doit y arriver apres s'etre
       identifie, pas atterrir sur le tableau de bord et devoir refaire le
       chemin. */
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return children;
}
