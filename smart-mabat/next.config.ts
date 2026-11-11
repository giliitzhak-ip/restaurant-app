import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone photos (resized client-side) to pass through server actions.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Ship the Hebrew fonts with the serverless functions that render branded images.
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
  serverExternalPackages: ["sharp"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
