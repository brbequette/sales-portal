import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path((?!auth/).*)',
        destination: '/.netlify/functions/:path*',
      },
    ]
  }
};

export default nextConfig;
