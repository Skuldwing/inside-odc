import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function AdminRoute({ children }) {
  const { role, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
