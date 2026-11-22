import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Leftover",
    short_name: "Leftover",
    description: "Your spending room",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111412",
    theme_color: "#111412",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
