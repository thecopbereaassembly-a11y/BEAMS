import type { MetadataRoute } from "next";

/**
 * PWA manifest — makes BEAMS installable on a phone so a Home Cell Leader can
 * open it like an app and capture attendance offline (docs/02 §5).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BEAMS · Berea English Assembly",
    short_name: "BEAMS",
    description:
      "Berea English Assembly Management System — The Church of Pentecost.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#231A6D",
    lang: "en-GH",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
