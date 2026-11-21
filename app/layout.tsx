import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { EmblemDefs } from "@/components/emblems";
import { PwaClient } from "@/components/pwa";
import { publicSiteUrl } from "@/lib/site";
import "./globals.css";

// Fuentes alojadas en el propio proyecto (app/fonts, licencia OFL): la compilación ya no depende de Google Fonts,
// que a veces falla en Vercel («An error occurred in next/font»). Subconjunto latino con tildes, ñ y signos.
const body = localFont({
  src: [
    { path: "./fonts/inter-regular.woff", weight: "400", style: "normal" },
    { path: "./fonts/inter-medium.woff", weight: "500", style: "normal" },
    { path: "./fonts/inter-semibold.woff", weight: "600", style: "normal" },
    { path: "./fonts/inter-bold.woff", weight: "700", style: "normal" },
    { path: "./fonts/inter-extrabold.woff", weight: "800", style: "normal" },
  ],
  variable: "--font-body", display: "swap", fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});
const brand = localFont({
  src: [{ path: "./fonts/montserrat-var.woff", weight: "500 700", style: "normal" }],
  variable: "--font-brand", display: "swap", fallback: ["system-ui", "Arial", "sans-serif"],
});

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
  // ENQORA instalable en iPhone/iPad (Safari → Agregar a pantalla de inicio): pantalla completa con barra de
  // estado oscura (el contenido empieza bajo ella). El ícono de Apple es app/apple-icon.png (logotipo oficial).
  appleWebApp: { capable: true, title: "ENQORA", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#101B2D",
  colorScheme: "dark",
  // Ocupa toda la pantalla en teléfonos con muesca; las áreas seguras las respeta el CSS (env(safe-area-inset-*)).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={`${body.variable} ${brand.variable}`}>
      <body>
        <EmblemDefs />
        {children}
        <PwaClient />
      </body>
    </html>
  );
}
