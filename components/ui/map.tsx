'use client';

import Image from 'next/image';
import { Navigation, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistance, formatEta } from '@/lib/utils/format';
import { boundsAround, type LatLng } from '@/lib/utils/geo';
import { Button } from './button';

export interface MapMarker {
  id: string;
  position: LatLng;
  label: string;
  kind: 'customer' | 'provider';
}

interface MapProps {
  center: LatLng;
  markers: MapMarker[];
  /** Static image from the configured maps provider; null falls back to a schematic. */
  imageUrl?: string | null;
  radiusKm?: number;
  etaMinutes?: number | null;
  distanceKm?: number | null;
  navigateTo?: { url: string; label: string } | null;
  className?: string;
}

/**
 * Live map panel.
 *
 * With a maps key configured it renders the provider's static tile. Without one
 * it draws a schematic: the relative positions are real (projected from the
 * bounding box) so the picture is still informative offline, and it is clearly
 * labelled as a schematic rather than pretending to be a map.
 */
export function Map({
  center,
  markers,
  imageUrl,
  radiusKm = 3,
  etaMinutes,
  distanceKm,
  navigateTo,
  className,
}: MapProps) {
  const bounds = boundsAround(center, Math.max(radiusKm, 0.5));

  const project = (point: LatLng) => ({
    // 0–100 % within the bounding box; clamped so a far marker stays visible.
    x: Math.min(96, Math.max(4, ((point.lng - bounds.west) / (bounds.east - bounds.west)) * 100)),
    y: Math.min(96, Math.max(4, ((bounds.north - point.lat) / (bounds.north - bounds.south)) * 100)),
  });

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <div className="relative aspect-[16/10] w-full bg-secondary">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="מפת המיקום"
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div
            className="absolute inset-0"
            role="img"
            aria-label={`תרשים מיקום: ${markers.map((m) => m.label).join(', ')}`}
          >
            <svg className="absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path
                    d="M 32 0 L 0 0 0 32"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-border"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
            {markers.length === 2 ? (
              <svg className="absolute inset-0 h-full w-full" aria-hidden>
                <line
                  x1={`${project(markers[0].position).x}%`}
                  y1={`${project(markers[0].position).y}%`}
                  x2={`${project(markers[1].position).x}%`}
                  y2={`${project(markers[1].position).y}%`}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="6 5"
                  className="text-accent/60"
                />
              </svg>
            ) : null}
            <span className="absolute bottom-2 start-2 rounded bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground">
              תרשים מיקום — לא הוגדר ספק מפות
            </span>
          </div>
        )}

        {markers.map((marker) => {
          const { x, y } = project(marker.position);
          return (
            <span
              key={marker.id}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ insetInlineStart: `${x}%`, top: `${y}%` }}
            >
              <span
                className={cn(
                  'flex flex-col items-center gap-0.5',
                  marker.kind === 'provider' ? 'text-accent' : 'text-foreground',
                )}
              >
                <span className="whitespace-nowrap rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm">
                  {marker.label}
                </span>
                <MapPin
                  className={cn(
                    'size-6 drop-shadow',
                    marker.kind === 'provider' ? 'fill-accent/20' : 'fill-foreground/10',
                  )}
                  aria-hidden
                />
              </span>
            </span>
          );
        })}
      </div>

      {(etaMinutes !== undefined && etaMinutes !== null) || distanceKm || navigateTo ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3">
          <div className="flex items-center gap-4 text-sm">
            {etaMinutes !== undefined && etaMinutes !== null ? (
              <span>
                זמן הגעה: <strong className="num">{formatEta(etaMinutes)}</strong>
              </span>
            ) : null}
            {distanceKm !== undefined && distanceKm !== null ? (
              <span className="text-muted-foreground">
                מרחק: <span className="num">{formatDistance(distanceKm)}</span>
              </span>
            ) : null}
          </div>
          {navigateTo ? (
            <Button asChild size="sm" variant="accent">
              <a href={navigateTo.url} target="_blank" rel="noopener noreferrer">
                <Navigation aria-hidden />
                {navigateTo.label}
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
