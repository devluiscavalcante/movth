import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movth",
  description: "Streaming platform foundation"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
