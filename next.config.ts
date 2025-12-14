import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true, 
  images: {
    unoptimized: true,
  },
};

export default nextConfig;