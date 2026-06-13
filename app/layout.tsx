import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mon Assistant",
  description: "Assistant personnel autonome connecte a Gmail et l'agenda",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
