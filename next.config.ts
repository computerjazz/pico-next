import type { NextConfig } from "next";
import withMDX from "@next/mdx";

const nextConfig: NextConfig = {
  deploymentId: process.env.GIT_SHA, // or any per-deploy string
  env: { NEXT_PUBLIC_BUILD_ID: process.env.GIT_SHA },
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/tesseract.js/**"],
  },
  // productionBrowserSourceMaps: true,
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
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
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default withMDX({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})(nextConfig);
