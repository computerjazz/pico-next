import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/tesseract.js/**"],
  },
  // productionBrowserSourceMaps: true,
  serverExternalPackages: ["tesseract.js"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // serverSourceMaps: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
