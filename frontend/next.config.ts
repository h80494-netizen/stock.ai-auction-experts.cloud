import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['stock.ai-auction-experts.cloud', 'ai-auction-experts.cloud'],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8080/api/:path*",
      },
    ];
  },
};

export default nextConfig;
