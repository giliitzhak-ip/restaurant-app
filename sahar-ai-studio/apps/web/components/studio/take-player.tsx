import { Download, FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Inline MP4 player that works on iPhone Safari (playsInline, Range-capable source) with a
 * download link (Content-Disposition: attachment). Technical test renders are labelled.
 */
export function TakePlayer({
  assetId,
  isTestRender,
  testBadge,
  downloadLabel,
  className,
}: {
  assetId: string;
  isTestRender: boolean;
  testBadge: string;
  downloadLabel: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <video
          src={`/api/media/${assetId}`}
          controls
          playsInline
          preload="metadata"
          className="max-h-[70dvh] w-full"
          data-testid="take-video"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {isTestRender ? (
          <Badge variant="muted" data-testid="test-render-badge">
            <FlaskConical className="size-3" aria-hidden />
            {testBadge}
          </Badge>
        ) : (
          <span />
        )}
        <Button asChild variant="outline" size="sm">
          {/* Content-Disposition: attachment makes this a download (iOS Safari saves to Files);
              no download attribute, so the server's descriptive filename is used. */}
          <a href={`/api/media/${assetId}?download=1`} data-testid="take-download">
            <Download aria-hidden />
            {downloadLabel}
          </a>
        </Button>
      </div>
    </div>
  );
}
