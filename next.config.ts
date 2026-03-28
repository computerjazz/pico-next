import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/tesseract.js/**"],
  },
  productionBrowserSourceMaps: true,
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js"],
    serverSourceMaps: true,
  },
};

export default nextConfig;
