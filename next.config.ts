import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  // Allow the specific IP seen in the warning, and potentially others
  // This suppresses the "Cross origin request detected" warning
  allowedDevOrigins: ["*"], 
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
      bodySizeLimit: "4096mb",
    },
    // @ts-ignore
    middlewareClientMaxBodySize: "4096mb",
  },
  async rewrites() {
    return [
      // Rewrite removed in favor of dynamic route handler in src/app/s3-proxy/[...path]/route.ts
    ]
  },
};

export default nextConfig;
