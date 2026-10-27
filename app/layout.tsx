import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import { EmblemDefs } from "@/components/emblems";
import { publicSiteUrl } from "@/lib/site";
import "./globals.css";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const brand = Montserrat({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-brand", display: "swap" });

// Por defecto nada se indexa: solo las páginas públicas lo habilitan (ver lib/site.ts → indexable).
export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl()),
  title: { default: "ENQORA", template: "%s · ENQORA" },
  description: "Inteligencia contable y tributaria. Tu negocio, siempre un paso adelante.",
  applicationName: "ENQORA",
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "ENQORA",
    title: "ENQORA · Inteligencia contable y tributaria",
    description: "Contabilidad, constitución, formalización, marcas y gestión para tu empresa, con inteligencia y profesionales.",
    images: [{ url: "/brand/enqora-icon-512.png", width: 512, height: 512, alt: "ENQORA" }],
  },
  twitter: { card: "summary" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#101B2D",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${body.variable} ${brand.variable}`}>
      <body>
        <EmblemDefs />
        {children}
      </body>
    </html>
  );
}
