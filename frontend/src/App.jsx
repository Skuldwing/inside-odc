import { Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import Login from "./Login";
import SetPassword from "./pages/SetPassword";

import Dashboard from "./pages/Dashboard";
import OperationsHub from "./pages/OperationsHub";
import Participants from "./pages/Participants";
import Campagnes from "./pages/Campagnes";
import Dispositifs from "./pages/Dispositifs";
import Partenaires from "./pages/Partenaires";
import Utilisateurs from "./pages/Utilisateurs";
import SocialDashboard from "./pages/SocialDashboard";
import AiAssistant from "./pages/AiAssistant";

import PrivateRoute from "./routes/PrivateRoute";
import AdminRoute from "./routes/AdminRoute";

export default function App() {
  return (
    <Routes>
      {/* ===== PUBLIC ===== */}
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />

      {/* ===== PROTECTED APP ===== */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="activities" element={<OperationsHub />} />
        <Route path="participants" element={<Participants />} />

        {/* ===== ADMIN ONLY ===== */}
        <Route
          path="social-dashboard"
          element={
            <AdminRoute>
              <SocialDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="assistant-ia"
          element={
            <AdminRoute>
              <AiAssistant />
            </AdminRoute>
          }
        />
        <Route
          path="campagnes"
          element={
            <AdminRoute>
              <Campagnes />
            </AdminRoute>
          }
        />
        <Route
          path="dispositifs"
          element={
            <AdminRoute>
              <Dispositifs />
            </AdminRoute>
          }
        />
        <Route
          path="partenaires"
          element={
            <AdminRoute>
              <Partenaires />
            </AdminRoute>
          }
        />
        <Route
          path="utilisateurs"
          element={
            <AdminRoute>
              <Utilisateurs />
            </AdminRoute>
          }
        />
      </Route>
    </Routes>
  );
}
