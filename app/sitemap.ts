import type { MetadataRoute } from "next";
import { indexable, publicSiteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!indexable()) return [];
  const base = publicSiteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/registro`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/ingresar`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terminos`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
