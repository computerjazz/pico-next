import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "sh0rtwave",
    short_name: "sh0rtwave",
    start_url: "/shortwave",
    display: "standalone",
    background_color: "#f4f1ea",
    theme_color: "#e04420",
    icons: [
      {
        src: "/img/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
