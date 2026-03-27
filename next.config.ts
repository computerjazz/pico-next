import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/tesseract.js/**"],
  },
  experimental: {
    serverComponentsExternalPackages: ["tesseract.js"],
  },
};

export default nextConfig;
