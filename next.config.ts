import type { NextConfig } from "next";
import withMDX from "@next/mdx";
const nextConfig: NextConfig = {
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
        pathname: "/api/bike/streetview",
        // omit `search` to allow any query string
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
