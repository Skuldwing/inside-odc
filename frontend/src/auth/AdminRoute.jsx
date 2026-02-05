import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export default function AdminRoute({ children }) {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
