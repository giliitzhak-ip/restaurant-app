import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

const PUBLIC_PATHS = [
  '',
  '/login',
  '/signup',
  '/legal/terms',
  '/legal/privacy',
  '/legal/cancellation',
  '/legal/provider-agreement',
  '/legal/payment-terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PATHS.map((path) => ({
    url: `${env.appUrl}${path}`,
    lastModified: now,
    changeFrequency: path.startsWith('/legal') ? ('yearly' as const) : ('weekly' as const),
    priority: path === '' ? 1 : 0.6,
  }));
}
