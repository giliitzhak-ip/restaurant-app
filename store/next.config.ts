import type { NextConfig } from 'next'

/**
 * Remote image hosts. Local uploads are served by the /media route handler and
 * need no entry here; add the CDN host once a remote storage provider is
 * configured (S3_PUBLIC_BASE_URL or Cloudinary).
 */
function remotePatterns() {
  const hosts = [process.env.S3_PUBLIC_BASE_URL, process.env.CLOUDINARY_CLOUD_NAME ? 'https://res.cloudinary.com' : undefined]
    .filter((value): value is string => Boolean(value))

  return hosts.flatMap((value) => {
    try {
      const url = new URL(value)
      return [{ protocol: url.protocol.replace(':', '') as 'http' | 'https', hostname: url.hostname }]
    } catch {
      return []
    }
  })
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: remotePatterns(),
  },
}

export default nextConfig
