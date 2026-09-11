import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
  withCredentials: true,
});

/* ===== LOADING TRACKER (drives the global top progress bar) ===== */
let activeRequests = 0;
const loadingListeners = new Set();

function setActiveRequests(next) {
  activeRequests = Math.max(0, next);
  loadingListeners.forEach((listener) => listener(activeRequests));
}

export function subscribeLoading(listener) {
  loadingListeners.add(listener);
  listener(activeRequests);
  return () => loadingListeners.delete(listener);
}

/* ===== INTERCEPTOR TOKEN ===== */
api.interceptors.request.use(
  (config) => {
    const adminPin = sessionStorage.getItem("admin_pin");
    if (adminPin) {
      config.headers["X-Admin-Pin"] = adminPin;
    }
    setActiveRequests(activeRequests + 1);
    return config;
  },
  (error) => {
    setActiveRequests(activeRequests - 1);
    return Promise.reject(error);
  }
);

const PUBLIC_PREFIXES = ["/login", "/set-password", "/checkin/", "/f/", "/vote/join/", "/vote/jury/", "/vote/guest-join/", "/vote/guest/", "/vote/project/"];

/* La racine est comparee a l'identique, pas en prefixe : « / » est le prefixe
   de toutes les adresses, l'ajouter a la liste ci-dessus desactiverait la
   redirection partout. */
const PUBLIC_EXACTES = ["/"];

function estPagePublique(chemin) {
  return PUBLIC_EXACTES.includes(chemin) || PUBLIC_PREFIXES.some((p) => chemin.startsWith(p));
}

/* /auth/me est la verification de session lancee au demarrage. Un 401 y est
   la reponse normale pour qui n'est pas connecte : ce n'est pas une session
   expiree, c'est l'absence de session. Rediriger ici priverait le routeur de
   sa decision — il envoyait un visiteur anonyme vers /login au lieu de la page
   d'accueil, et faisait perdre l'adresse demandee puisque le rechargement
   complet efface l'etat de navigation. */
function estSondeDeSession(config) {
  return String(config?.url || "").includes("/auth/me");
}

api.interceptors.response.use(
  (response) => {
    setActiveRequests(activeRequests - 1);
    return response;
  },
  (error) => {
    setActiveRequests(activeRequests - 1);
    if (error?.response?.status === 401) {
      localStorage.removeItem("user");
      sessionStorage.removeItem("admin_pin");
      sessionStorage.removeItem("admin_pin_time");
      const { pathname, search } = window.location;

      /* Ici, un 401 signifie une session expiree en cours d'utilisation. On
         emmene vers la connexion en gardant l'adresse en cours, pour y revenir
         une fois identifie plutot que de repartir du tableau de bord. */
      if (!estSondeDeSession(error.config) && !estPagePublique(pathname)) {
        const retour = encodeURIComponent(pathname + search);
        window.location.href = `/login?next=${retour}`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
