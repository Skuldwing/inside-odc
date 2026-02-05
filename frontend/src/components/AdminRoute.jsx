import { Navigate } from "react-router-dom";

export default function AdminRoute({ children }) {
  // MOCK USER (à remplacer par JWT plus tard)
  const currentUser = {
    role: "admin", // admin | partner | viewer
  };

  if (currentUser.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
}
