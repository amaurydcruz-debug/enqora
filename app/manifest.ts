import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ENQORA — Inteligencia contable y tributaria",
    short_name: "ENQORA",
    description: "Tu negocio, siempre un paso adelante.",
    start_url: "/panel",
    display: "standalone",
    background_color: "#0A1220",
    theme_color: "#101B2D",
    lang: "es-CL",
    icons: [{ src: "/brand/enqora-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
