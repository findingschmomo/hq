import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel-compatible settings
  output: undefined, // default — Vercel handles this automatically
  // Pin workspace root: a stray ~/package-lock.json otherwise makes Next
  // infer the wrong root and break module resolution in production.
  outputFileTracingRoot: __dirname,
  images: {
    unoptimized: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
