import Image from 'next/image';
import { cn } from '@/lib/utils';
import { initialsOf } from '@/lib/utils/format';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: { box: 'h-8 w-8 text-xs', px: 32 },
  md: { box: 'h-11 w-11 text-sm', px: 44 },
  lg: { box: 'h-14 w-14 text-base', px: 56 },
  xl: { box: 'h-20 w-20 text-xl', px: 80 },
} as const;

/** Falls back to initials, so a missing image never leaves an empty circle. */
export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const { box, px } = SIZES[size];

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-semibold text-secondary-foreground',
        box,
        className,
      )}
    >
      {src ? (
        <Image src={src} alt={name} width={px} height={px} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initialsOf(name) || '?'}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}
