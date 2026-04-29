import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./layout/Layout";
import Login from "./Login";
import SetPassword from "./pages/SetPassword";

import PrivateRoute from "./routes/PrivateRoute";
import AdminRoute from "./routes/AdminRoute";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const OperationsHub = lazy(() => import("./pages/OperationsHub"));
const Participants = lazy(() => import("./pages/Participants"));
const Campagnes = lazy(() => import("./pages/Campagnes"));
const Dispositifs = lazy(() => import("./pages/Dispositifs"));
const Partenaires = lazy(() => import("./pages/Partenaires"));
const Utilisateurs = lazy(() => import("./pages/Utilisateurs"));
const SocialDashboard = lazy(() => import("./pages/SocialDashboard"));
const Formulaires = lazy(() => import("./pages/Formulaires"));
const PublicForm = lazy(() => import("./pages/PublicForm"));

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-slate-500">
      Chargement...
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* ===== PUBLIC ===== */}
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route
        path="/f/:slug"
        element={
          <Suspense fallback={<PageLoader />}>
            <PublicForm />
          </Suspense>
        }
      />

      {/* ===== PROTECTED APP ===== */}
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="activities"
          element={
            <Suspense fallback={<PageLoader />}>
              <OperationsHub />
            </Suspense>
          }
        />
        <Route
          path="participants"
          element={
            <Suspense fallback={<PageLoader />}>
              <Participants />
            </Suspense>
          }
        />

        {/* ===== ADMIN ONLY ===== */}
        <Route
          path="social-dashboard"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <SocialDashboard />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="campagnes"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Campagnes />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="dispositifs"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Dispositifs />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="partenaires"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Partenaires />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="utilisateurs"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Utilisateurs />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="formulaires"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Formulaires />
              </Suspense>
            </AdminRoute>
          }
        />
      </Route>
    </Routes>
  );
}
