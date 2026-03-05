"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { api } from "./api";

interface AuthState {
  user: { id: string; name: string; email: string; organizationId: string } | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { organizationName: string; name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      api
        .me()
        .then((u: any) => setUser(u))
        .catch(() => {
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    api.setToken(res.accessToken);
    setUser(res.user);
  };

  const register = async (input: { organizationName: string; name: string; email: string; password: string }) => {
    const res = await api.register(input);
    api.setToken(res.accessToken);
    setUser(res.user);
  };

  const logout = () => {
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
