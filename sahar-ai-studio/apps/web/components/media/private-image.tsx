import { cn } from '@/lib/utils';

/**
 * Image served through the authorized media route. A plain <img> on purpose: the
 * response is private (cookie-authenticated), so it must not go through the Next.js
 * image optimizer cache. Browsers apply EXIF orientation to originals themselves.
 */
export function PrivateImage({
  assetId,
  alt,
  className,
}: {
  assetId: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/media/${assetId}`}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('object-cover', className)}
    />
  );
}
