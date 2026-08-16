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
      const isPublic = PUBLIC_PREFIXES.some(p => window.location.pathname.startsWith(p));
      if (!isPublic) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
