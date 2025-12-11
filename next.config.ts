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
      {
        source: '/s3-proxy/:path*',
        destination: process.env.S3_API_ENDPOINT ? `${process.env.S3_API_ENDPOINT}/:path*` : 'http://localhost:3900/:path*', // Proxy to S3
      },
    ]
  },
};

export default nextConfig;
