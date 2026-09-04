import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import PageLoader from "../components/PageLoader";

/* Garde d'acces a Mbootay : admins + membres de l'equipe ODC. */
export default function TeamOdcRoute({ children }) {
  const { isAuthenticated, isTeamOdc, authReady } = useAuth();

  if (!authReady) {
    return <PageLoader label="Vérification de la session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isTeamOdc) {
    return <Navigate to="/" replace />;
  }

  return children;
}
