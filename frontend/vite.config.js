import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { accueilStatique } from "./vite-plugin-accueil-statique.js";

export default defineConfig({
  /* « accueilStatique » écrit la page d'accueil en clair dans le document, pour
     les robots qui n'exécutent pas de JavaScript — à commencer par ceux de
     WhatsApp et de Facebook, qui composent l'aperçu d'un lien partagé. Le
     détail est en tête du greffon. */
  plugins: [react(), accueilStatique()],
});
