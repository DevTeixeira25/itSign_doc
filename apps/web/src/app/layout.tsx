import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";

export const metadata = {
  title: "ITSign",
  description: "Plataforma de assinatura digital"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
