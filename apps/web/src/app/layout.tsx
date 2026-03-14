import "./globals.css";
import type { ReactNode } from "react";
import { AuthProvider } from "../lib/auth-context";
import ThemeToggle from "../components/ThemeToggle";

export const metadata = {
  title: "ITSign",
  description: "Plataforma de assinatura digital"
};

const themeInitScript = `
  try {
    const savedTheme = localStorage.getItem("itsign-theme");
    const theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <AuthProvider>{children}</AuthProvider>
        <ThemeToggle />
      </body>
    </html>
  );
}
