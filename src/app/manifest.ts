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
    theme_color: "#1740b3",
    lang: "en-GH",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
