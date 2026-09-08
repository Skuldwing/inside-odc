/** @type {import('tailwindcss').Config} */

/* Rampe de marque Orange Digital Center.
   Construite autour de #FF7900 — l'orange officiel Orange — et non autour de
   #F97316, l'orange par defaut de Tailwind sur lequel l'interface s'appuyait
   jusqu'ici. Meme teinte (28,47°) a tous les paliers, luminosites calees sur
   celles de la rampe orange de Tailwind pour que la substitution soit neutre
   en contraste. */
const odc = {
  50:  "#FFF6EE",
  100: "#FEE9D6",
  200: "#FED3AC",
  300: "#FEB675",
  400: "#FE973A",
  500: "#FF7900",
  600: "#DE6A00",
  700: "#B55703",
  800: "#914805",
  900: "#753C07",
  950: "#442204",
};

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        odc,
        /* `orange-*` est reaffecte a la rampe de marque : les classes existantes
           basculent sur le bon orange sans avoir a etre toutes reecrites, et une
           nouvelle classe `orange-*` reste correcte par defaut. */
        orange: odc,
      }
    }
  },
  plugins: []
};
