import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WEGO BUSINESS ERP",
    short_name: "WEGO ERP",
    description: "Luxury financial control center — WEGO BUSINESS",
    start_url: "/",
    display: "standalone",
    background_color: "#0f2b2a",
    theme_color: "#071826",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
