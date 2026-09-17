import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Personal and transactional areas carry nothing a crawler should index.
        disallow: [
          "/admin",
          "/account",
          "/cart",
          "/checkout",
          "/order",
          "/login",
          "/register",
          "/uploads",
          "/api",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
