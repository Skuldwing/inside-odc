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
      .catch((err) => {
        if (!mounted) return;
        /* On ne ferme la session que si le serveur a repondu. Une panne
           reseau ne prouve rien sur la validite de la session, et vider le
           stockage ici deconnectait l'utilisateur a la moindre coupure —
           precisement ce qui arrive en salle avec un Wi-Fi instable.
           La securite ne repose pas la-dessus : chaque requete est de toute
           facon verifiee cote serveur. */
        if (err?.response) {
          setUser(null);
          localStorage.removeItem("user");
        }
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
        isCoach: role === "coach",
        isViewer: role === "viewer",
        // Acces Mbootay : les admins l'ont d'office, les autres via le drapeau.
        isTeamOdc: role === "admin" || !!user?.is_team_odc,
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
