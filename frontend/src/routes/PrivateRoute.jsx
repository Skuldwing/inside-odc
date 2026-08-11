import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import PageLoader from "../components/PageLoader";

export default function PrivateRoute({ children }) {
  const { isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return <PageLoader label="Vérification de la session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
