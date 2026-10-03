import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['stock.ai-auction-experts.cloud', 'ai-auction-experts.cloud'],
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
