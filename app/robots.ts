import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/** Public marketing and legal pages are indexable; everything behind auth is not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/legal/'],
      disallow: ['/app/', '/provider/', '/admin/', '/api/', '/auth/'],
    },
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
