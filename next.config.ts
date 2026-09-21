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
  async redirects() {
    return [
      {
        // The legal centre moved to /shipping-and-returns. Anything already
        // indexed or linked keeps resolving.
        source: "/shipping-returns",
        destination: "/shipping-and-returns",
        permanent: true,
      },
    ];
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
            /*
             * The room designer needs the camera; nothing else is required.
             * `interest-cohort` and the ad-tech surfaces are denied explicitly
             * so a third-party script added later cannot quietly turn them on.
             */
            value:
              "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), " +
              "magnetometer=(), accelerometer=(), gyroscope=(), browsing-topics=()",
          },
          /*
           * HSTS. Sent unconditionally because the header is only honoured
           * over https to begin with — a browser on http ignores it — so
           * there is nothing to gate on, and gating on NODE_ENV would mean the
           * staging deploy that most resembles production is the one running
           * without it.
           *
           * No `preload` directive: preloading is a one-way door for the whole
           * apex domain, including subdomains nobody has thought about yet.
           * That is the site owner's decision to make, not a default.
           */
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
