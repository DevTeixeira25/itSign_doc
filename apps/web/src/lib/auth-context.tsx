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
import { db } from "./firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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

/** Save user to Firestore users collection */
async function saveUserToFirestore(fbUser: FirebaseUser, extra?: { organizationName?: string }) {
  const userRef = doc(db, "users", fbUser.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    await setDoc(userRef, {
      name: fbUser.displayName ?? fbUser.email ?? "Usuário",
      email: fbUser.email ?? "",
      organizationName: extra?.organizationName ?? "Minha Organização",
      provider: fbUser.providerData?.[0]?.providerId ?? "unknown",
      createdAt: serverTimestamp(),
    });
  }

  const data = (await getDoc(userRef)).data()!;
  return {
    id: fbUser.uid,
    name: data.name,
    email: data.email,
    organizationId: data.organizationName ?? "",
  };
}

/** Try to get local user; if not found, auto-register using Firebase profile */
async function ensureLocalUser(fbUser: FirebaseUser) {
  return saveUserToFirestore(fbUser);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState["user"]>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Listen to Firebase auth state and sync with Firestore
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const profile = await ensureLocalUser(fbUser);
          setUser(profile);
        } catch (err) {
          console.error("[auth] Failed to sync Firebase user:", err);
          setUser(null);
        }
      } else {
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
    const profile = await ensureLocalUser(cred.user);
    setUser(profile);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(firebaseAuth, provider);
    const profile = await ensureLocalUser(cred.user);
    setUser(profile);
  };

  const logout = async () => {
    await signOut(firebaseAuth);
    setUser(null);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(firebaseAuth, email);
  };

  const register = async (name: string, email: string, password: string, organizationName: string) => {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    await fbUpdateProfile(cred.user, { displayName: name });
    const profile = await saveUserToFirestore(cred.user, { organizationName });
    setUser(profile);
    setFirebaseUser(cred.user);
  };

  const updateUserProfile = async (data: { name?: string }) => {
    if (!firebaseUser) return;
    if (data.name) {
      await fbUpdateProfile(firebaseUser, { displayName: data.name });
      const userRef = doc(db, "users", firebaseUser.uid);
      const { updateDoc } = await import("firebase/firestore");
      await updateDoc(userRef, { name: data.name });
      setUser((prev) => prev ? { ...prev, name: data.name! } : prev);
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
