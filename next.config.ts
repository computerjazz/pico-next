import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/tesseract.js/**"],
  },
  productionBrowserSourceMaps: true,
  serverExternalPackages: ["tesseract.js"],
  experimental: {
    serverSourceMaps: true,
  },
};

export default nextConfig;
