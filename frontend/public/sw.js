/* Service worker d'Inside ODC.
 *
 * Objectif : que l'application s'ouvre meme sans reseau, et qu'un coach en
 * salle avec une connexion instable ne tombe pas sur la page d'erreur du
 * navigateur.
 *
 * Ce qui est mis en cache : uniquement la coquille de l'application — le
 * document HTML et les fichiers statiques produits par le build.
 *
 * Ce qui ne l'est JAMAIS : les reponses de l'API. Elles sont authentifiees
 * et propres a chaque utilisateur ; les conserver exposerait les donnees
 * d'une personne a la suivante sur un telephone partage, et ferait lire des
 * chiffres perimes. Ces requetes passent directement au reseau.
 *
 * La version est incrementee a chaque changement de strategie ; les caches
 * des versions precedentes sont supprimes a l'activation.
 */

const VERSION = "v1";
const SHELL_CACHE = `inside-odc-shell-${VERSION}`;
const ASSET_CACHE = `inside-odc-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";

/* Le build de Vite renomme les fichiers avec une empreinte a chaque
   compilation : on ne peut pas les lister ici. Seules les ressources dont
   le chemin est stable sont prechargees ; le reste est mis en cache au fil
   des visites. */
const SHELL_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icon-192.png",
  "/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      /* Une ressource manquante ne doit pas faire echouer toute
         l'installation : on les ajoute une par une. */
      .then((cache) =>
        Promise.allSettled(SHELL_URLS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("inside-odc-") && k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* Permet a la page de demander l'activation immediate d'une nouvelle
   version, quand l'utilisateur clique sur « Recharger ». */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isAssetRequest(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    /\.(?:css|js|woff2?|ttf|png|jpe?g|svg|webp|ico)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Seules les lectures sont concernees : un POST ou un DELETE ne passe
     jamais par le cache. */
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  /* Requetes vers une autre origine — l'API sur Railway, les polices
     Google : on ne s'en mele pas. */
  if (url.origin !== self.location.origin) return;

  /* Navigation : on privilegie le reseau pour avoir la derniere version,
     et on retombe sur le cache puis sur la page hors ligne. */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/index.html");
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  /* Fichiers statiques : leur nom porte une empreinte, donc un fichier
     trouve en cache est forcement le bon. On sert le cache d'abord. */
  if (isAssetRequest(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && response.status === 200) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});
