import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function AdminRoute({ children }) {
  const { role, isAuthenticated, authReady } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-slate-500">
        Verification session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
