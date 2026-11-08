import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qyron AI — Trợ lý AI cho mọi việc trong ngày",
    short_name: "Qyron",
    description:
      "Hỏi đáp, tìm ý tưởng, viết lách và xử lý việc thường ngày bằng tiếng Việt với Qyron AI.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbf7f1",
    theme_color: "#f4f4f6",
    lang: "vi",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
