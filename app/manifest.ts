import type { MetadataRoute } from "next";

// ENQORA instalable (ENQORA Everywhere). Íconos generados desde el logotipo oficial (public/brand):
// «maskable» es el mismo ícono al 80% sobre el azul noche, para que Android no recorte la Q.
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
    icons: [
      { src: "/brand/enqora-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/enqora-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/enqora-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/enqora-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "Centro de control", short_name: "Panel", url: "/panel", icons: [{ src: "/brand/enqora-icon-192.png", sizes: "192x192" }] },
      { name: "Consultar un RUT", short_name: "Consultar RUT", url: "/#bienvenida", icons: [{ src: "/brand/enqora-icon-192.png", sizes: "192x192" }] },
    ],
  };
}
