import type { MetadataRoute } from "next";

// ENQORA instalable (ENQORA Everywhere). Íconos generados desde el logotipo oficial (public/brand):
// El ícono es solo el reloj, sin fondo (transparente). iPhone usa app/apple-icon.png, que sí lleva fondo: iOS no admite transparencia.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ENQORA",
    short_name: "ENQORA",
    description: "Inteligencia contable y tributaria. Tu negocio, siempre un paso adelante.",
    start_url: "/panel",
    scope: "/",
    display: "standalone",
    background_color: "#050914",
    theme_color: "#101B2D",
    lang: "es-CL",
    dir: "ltr",
    categories: ["finance", "business", "productivity"],
    // Ícono del instalador: solo el reloj, con fondo transparente, para que se vea bien sobre cualquier fondo de pantalla.
    icons: [
      { src: "/brand/enqora-reloj-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/enqora-reloj-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Centro de control", short_name: "Panel", url: "/panel", icons: [{ src: "/brand/enqora-reloj-192.png", sizes: "192x192" }] },
      { name: "Consultar un RUT", short_name: "Consultar RUT", url: "/#bienvenida", icons: [{ src: "/brand/enqora-reloj-192.png", sizes: "192x192" }] },
    ],
  };
}
