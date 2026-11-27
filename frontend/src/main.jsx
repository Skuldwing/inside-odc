import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/useAuth";
import TopProgressBar from "./components/TopProgressBar";
import {
  ToastProvider,
  ConfirmProvider,
  ServiceWorkerUpdate,
  OfflineBanner,
} from "./components/ui";
import ErreurPage, { rechargerUneFois } from "./components/ErreurPage";
import "./index.css";

/* Après une mise en ligne, une page restée ouverte peut demander un fichier de
   l'ancienne version, qui n'existe plus. Vite le signale ici : on recharge,
   une fois, pour prendre la nouvelle version au lieu d'échouer. */
window.addEventListener("vite:preloadError", (event) => {
  if (rechargerUneFois()) event.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        {/* ConfirmProvider s'appuie sur Modal, qui n'a pas besoin d'auth :
            les deux fournisseurs enveloppent donc AuthProvider, et restent
            disponibles jusque sur les pages publiques (emargement, formulaires). */}
        <ConfirmProvider>
          <AuthProvider>
            <TopProgressBar />
            <OfflineBanner />
            <ServiceWorkerUpdate />
            <ErreurPage pleinePage>
              <App />
            </ErreurPage>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
