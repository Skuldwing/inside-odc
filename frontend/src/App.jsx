import { Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import Login from "./Login";

import Dashboard from "./pages/Dashboard";
import Activities from "./pages/Activities";
import Participants from "./pages/Participants";
import Campagnes from "./pages/Campagnes";
import Dispositifs from "./pages/Dispositifs";
import Partenaires from "./pages/Partenaires";
import Utilisateurs from "./pages/Utilisateurs";

import PrivateRoute from "./routes/PrivateRoute";
import AdminRoute from "./routes/AdminRoute";

export default function App() {
  return (
    <Routes>
      {/* ===== PUBLIC ===== */}
      <Route path="/login" element={<Login />} />

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
        <Route path="activities" element={<Activities />} />
        <Route path="participants" element={<Participants />} />

        {/* ===== ADMIN ONLY ===== */}
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
