import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    serverActions: {
      // Dev preview proxy (127.0.0.1:PORT) uzerinden gelen server-action POST'lari
      // origin/host eslesmezligine takilmasin
      allowedOrigins: ["127.0.0.1:49317", "localhost:3000", "localhost:49317"],
    },
  },
};

export default nextConfig;
