import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/tesseract.js/**"],
  },
  // productionBrowserSourceMaps: true,
  serverExternalPackages: ["tesseract.js"],
  productionBrowserSourceMaps: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    serverSourceMaps: false,
  },
  images: {
    minimumCacheTTL: 60 * 60 * 24,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
