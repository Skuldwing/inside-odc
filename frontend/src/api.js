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

export default api;
