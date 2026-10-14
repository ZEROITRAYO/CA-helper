import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useLayoutEffect, useState } from "react";

import { apiFetch, setAuth } from "@/api";
import { clearSession, loadSession, saveSession } from "@/lib";

export const AuthContext = createContext(null);

// cointains the saved login (token and user) and gives the token
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [savedLogin, setSavedLogin] = useState(loadSession());
  const [clickedLogout, setClickedLogout] = useState(false);

  function endSession() {
    clearSession();
    setSavedLogin(null);
    queryClient.clear(); 
  }

  function logout() {
    setClickedLogout(true);
    endSession();
  }

  useLayoutEffect(() => {
    const token = savedLogin ? savedLogin.accessToken : null;
    setAuth(token, endSession);
  }, [savedLogin]);

  async function login(email, password) {
    const data = await apiFetch("/api/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });
    const newLogin = { accessToken: data.access_token, user: data.user };
    saveSession(newLogin);
    setClickedLogout(false);
    setSavedLogin(newLogin);
    return data.user;
  }

  const user = savedLogin ? savedLogin.user : null;
  const shared = { user, login, logout, clickedLogout };

  return <AuthContext.Provider value={shared}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const shared = useContext(AuthContext);
  if (!shared) throw new Error("useAuth() error");
  return shared;
}
