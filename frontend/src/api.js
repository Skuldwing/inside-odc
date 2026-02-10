import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3000",
});

/* ===== INTERCEPTOR TOKEN ===== */
api.interceptors.request.use(config => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const adminPin = sessionStorage.getItem("admin_pin");
  if (adminPin) {
    config.headers["X-Admin-Pin"] = adminPin;
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      sessionStorage.removeItem("admin_pin");
      sessionStorage.removeItem("admin_pin_time");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
