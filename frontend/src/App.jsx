import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./layout/Layout";
import Login from "./Login";
import Landing from "./pages/Landing";
import SetPassword from "./pages/SetPassword";
import PageLoader from "./components/PageLoader";

import PrivateRoute from "./routes/PrivateRoute";
import AdminRoute from "./routes/AdminRoute";
import TeamOdcRoute from "./routes/TeamOdcRoute";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Activities = lazy(() => import("./pages/Activities"));
const Participants = lazy(() => import("./pages/Participants"));
const Campagnes = lazy(() => import("./pages/Campagnes"));
const Dispositifs = lazy(() => import("./pages/Dispositifs"));
const Partenaires = lazy(() => import("./pages/Partenaires"));
const PartenaireDetail = lazy(() => import("./pages/PartenaireDetail"));
const Utilisateurs = lazy(() => import("./pages/Utilisateurs"));
const AiAssistant = lazy(() => import("./pages/AiAssistant"));
const Formulaires = lazy(() => import("./pages/Formulaires"));
const FormulaireEditor = lazy(() => import("./pages/FormulaireEditor"));
const PublicForm = lazy(() => import("./pages/PublicForm"));
const CheckinPage = lazy(() => import("./pages/CheckinPage"));
const VoteJoin = lazy(() => import("./pages/VoteJoin"));
const VoteJury = lazy(() => import("./pages/VoteJury"));
const VoteGuestJoin = lazy(() => import("./pages/VoteGuestJoin"));
const VoteGuest = lazy(() => import("./pages/VoteGuest"));
const VoteProject = lazy(() => import("./pages/VoteProject"));
const Vote = lazy(() => import("./pages/Vote"));
const VoteConfig = lazy(() => import("./pages/VoteConfig"));
const VoteManage = lazy(() => import("./pages/VoteManage"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Fiabilite = lazy(() => import("./pages/Fiabilite"));
const Mbootay = lazy(() => import("./pages/Mbootay"));
const Profil = lazy(() => import("./pages/Profil"));
const MbootayProjet = lazy(() => import("./pages/MbootayProjet"));

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
      <Route
        path="/checkin/:activityId"
        element={
          <Suspense fallback={<PageLoader />}>
            <CheckinPage />
          </Suspense>
        }
      />
      <Route
        path="/vote/join/:sessionId"
        element={
          <Suspense fallback={<PageLoader />}>
            <VoteJoin />
          </Suspense>
        }
      />
      <Route
        path="/vote/jury/:sessionId"
        element={
          <Suspense fallback={<PageLoader />}>
            <VoteJury />
          </Suspense>
        }
      />
      <Route
        path="/vote/guest-join/:sessionId"
        element={
          <Suspense fallback={<PageLoader />}>
            <VoteGuestJoin />
          </Suspense>
        }
      />
      <Route
        path="/vote/guest/:sessionId"
        element={
          <Suspense fallback={<PageLoader />}>
            <VoteGuest />
          </Suspense>
        }
      />
      <Route
        path="/vote/project/:sessionId"
        element={
          <Suspense fallback={<PageLoader />}>
            <VoteProject />
          </Suspense>
        }
      />

      {/* La racine est publique : c'est la page d'accueil du domaine. */}
      <Route path="/" element={<Landing />} />

      {/* ===== PROTECTED APP =====
          Route sans chemin propre : si on lui laissait « / », elle entrerait en
          concurrence avec la page d'accueil publique — et c'est elle qui
          gagnait, renvoyant tout visiteur non connecte vers /login. Ses enfants
          portent des chemins relatifs, qui se resolvent donc a la racine. */}
      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route
          path="dashboard"
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
              <Activities />
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
        <Route
          path="profil"
          element={
            <Suspense fallback={<PageLoader />}>
              <Profil />
            </Suspense>
          }
        />

        {/* ===== ESPACE EQUIPE ODC ===== */}
        <Route
          path="mbootay"
          element={
            <TeamOdcRoute>
              <Suspense fallback={<PageLoader />}>
                <Mbootay />
              </Suspense>
            </TeamOdcRoute>
          }
        />
        <Route
          path="mbootay/:id"
          element={
            <TeamOdcRoute>
              <Suspense fallback={<PageLoader />}>
                <MbootayProjet />
              </Suspense>
            </TeamOdcRoute>
          }
        />

        {/* ===== ADMIN ONLY ===== */}
        <Route
          path="assistant-ia"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <AiAssistant />
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
          path="partenaires/:id"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <PartenaireDetail />
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
        <Route
          path="formulaires/new"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <FormulaireEditor />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="formulaires/:id/edit"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <FormulaireEditor />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="vote"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Vote />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="vote/:id"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <VoteConfig />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="vote/:id/manage"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <VoteManage />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="audit"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <AuditLogs />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route
          path="fiabilite"
          element={
            <AdminRoute>
              <Suspense fallback={<PageLoader />}>
                <Fiabilite />
              </Suspense>
            </AdminRoute>
          }
        />

      </Route>

      {/* Toute adresse inconnue ramene a l'accueil. Cette route doit rester au
          premier niveau : placee dans le bloc protege, son motif « * » captait
          aussi la racine et renvoyait les visiteurs vers /login au lieu de la
          page d'accueil. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
