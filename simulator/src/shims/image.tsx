/** `next/image` stand-in: a plain <img>, since there is no Next image server. */
import type { ImgHTMLAttributes } from 'react';

interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'width' | 'height'> {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  /** Next-only layout mode; emulated here with absolute positioning. */
  fill?: boolean;
  /** Next-only optimisation hints with no plain-<img> equivalent. */
  unoptimized?: boolean;
  priority?: boolean;
}

export default function Image({
  alt,
  fill,
  unoptimized: _unoptimized,
  priority,
  style,
  ...rest
}: ImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- this shim exists precisely because next/image is unavailable
    <img
      alt={alt}
      fetchPriority={priority ? 'high' : undefined}
      style={fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style } : style}
      {...rest}
    />
  );
}
