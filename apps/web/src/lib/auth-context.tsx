"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
  updateProfile as fbUpdateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth as firebaseAuth } from "./firebase";
import { api } from "./api";

interface AuthState {
  user: { id: string; name: string; email: string; organizationId: string } | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (name: string, email: string, password: string, organizationName: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateProfile: (data: { name?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Try to get local user; if not found, auto-register using Firebase profile */
async function ensureLocalUser(fbUser: FirebaseUser) {
  try {
    return await api.me();
  } catch {
    // First time this Firebase user touches our API — auto-create
    const res = await api.register({
      organizationName: fbUser.displayName ?? "Minha Organização",
      name: fbUser.displayName ?? fbUser.email ?? "Usuário",
      email: fbUser.email ?? "",
    });
    return res.user;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state and sync with API
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          api.setToken(idToken);
          const profile = await ensureLocalUser(fbUser);
          setUser(profile);
        } catch (err) {
          console.error("[auth] Failed to sync Firebase user with API:", err);
          setUser(null);
        }
      } else {
        api.setToken(null);
        setUser(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Refresh token periodically (Firebase tokens expire in 1h)
  useEffect(() => {
    if (!firebaseUser) return;
    const interval = setInterval(async () => {
      const newToken = await firebaseUser.getIdToken(true);
      api.setToken(newToken);
    }, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [firebaseUser]);

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const idToken = await cred.user.getIdToken();
    api.setToken(idToken);
    const profile = await ensureLocalUser(cred.user);
    setUser(profile);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(firebaseAuth, provider);
    const idToken = await cred.user.getIdToken();
    api.setToken(idToken);
    const profile = await ensureLocalUser(cred.user);
    setUser(profile);
  };

  const logout = async () => {
    await signOut(firebaseAuth);
    api.setToken(null);
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(firebaseAuth, email);
  };

  const register = async (name: string, email: string, password: string, organizationName: string) => {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    await fbUpdateProfile(cred.user, { displayName: name });
    const idToken = await cred.user.getIdToken();
    api.setToken(idToken);
    const res = await api.register({ organizationName, name, email });
    setUser(res.user);
    setFirebaseUser(cred.user);
  };

  const updateUserProfile = async (data: { name?: string }) => {
    const updated = await api.updateProfile(data);
    setUser(updated);
    if (data.name && firebaseUser) {
      await fbUpdateProfile(firebaseUser, { displayName: data.name });
    }
  };

  return (
    <AuthContext.Provider value={{ user, firebaseUser, loading, login, loginWithGoogle, register, logout, resetPassword, updateProfile: updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
