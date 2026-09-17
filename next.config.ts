import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Remote patterns are intentionally empty by default. Add the CDN / object
    // storage host here when real product photography is wired up
    // (see src/lib/storage/README.md).
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [375, 430, 640, 768, 1024, 1280, 1440, 1920],
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            // The room designer needs the camera; nothing else is required.
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
