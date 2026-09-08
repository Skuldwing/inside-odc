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
import "./index.css";

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
            <App />
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
