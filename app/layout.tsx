import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const brand = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-brand", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ENQORA", template: "%s · ENQORA" },
  description: "Inteligencia contable y tributaria. Tu negocio, siempre un paso adelante.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#101B2D",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${body.variable} ${brand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
