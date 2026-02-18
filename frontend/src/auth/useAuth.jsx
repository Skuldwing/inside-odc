import { createContext, useContext, useEffect, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [authReady, setAuthReady] = useState(false);

  const role = user?.role || "viewer";

  useEffect(() => {
    let mounted = true;
    api
      .get("/auth/me")
      .then((res) => {
        if (!mounted) return;
        const me = res.data?.user || null;
        setUser(me);
        if (me) {
          localStorage.setItem("user", JSON.stringify(me));
        } else {
          localStorage.removeItem("user");
        }
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
        localStorage.removeItem("user");
      })
      .finally(() => {
        if (mounted) setAuthReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  /* ================= LOGIN ================= */
  const login = async (email, password) => {
    const res = await api.post("/auth/login", {
      email,
      password,
    });

    setUser(res.data.user);
    localStorage.setItem("user", JSON.stringify(res.data.user));
  };

  /* ================= LOGOUT ================= */
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (_) {}

    setUser(null);
    localStorage.removeItem("user");
    sessionStorage.removeItem("admin_pin");
    sessionStorage.removeItem("admin_pin_time");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        role,
        isAuthenticated: !!user,
        isAdmin: role === "admin",
        isPartner: role === "partner",
        isViewer: role === "viewer",
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ================= HOOK ================= */
export function useAuth() {
  return useContext(AuthContext);
}
