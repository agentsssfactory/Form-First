import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, brand: "FormFirst", demo: false });

  const refresh = useCallback(async () => {
    try {
      const d = await api("/auth/me");
      setState({ loading: false, ...d });
    } catch {
      setState((s) => ({ ...s, loading: false, user: null }));
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const signIn = async (path, body) => {
    const d = await api(path, { method: "POST", body });
    setState((s) => ({ ...s, user: d.user }));
    return d.user;
  };
  const signOut = async () => {
    await api("/auth/logout", { method: "POST" });
    setState((s) => ({ ...s, user: null }));
  };
  const setUser = (user) => setState((s) => ({ ...s, user }));
  return <Ctx.Provider value={{ ...state, signIn, signOut, setUser }}>{children}</Ctx.Provider>;
}
