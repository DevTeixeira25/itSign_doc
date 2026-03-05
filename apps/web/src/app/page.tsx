"use client";

import { useAuth } from "../lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  return (
    <main className="container center-page">
      <div className="loader" />
      <p>Carregando…</p>
    </main>
  );
}
