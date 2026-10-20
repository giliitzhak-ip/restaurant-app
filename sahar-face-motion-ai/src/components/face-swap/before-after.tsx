"use client";

import { useRef, useState } from "react";
import { Play, Pause, Sparkles, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Mode = "after" | "before" | "compare";

/** Before/after viewer. "השוואה" plays both clips in sync (stacked on iPhone, side by side on desktop). */
export function BeforeAfter({ beforeId, afterId, ratio }: { beforeId: string; afterId: string; ratio: string }) {
  const [mode, setMode] = useState<Mode>("after");
  const [playing, setPlaying] = useState(false);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const src = (id: string, v: string) => `/api/assets/${id}/file?v=${v}`;

  const toggleBoth = async () => {
    const before = b.current;
    const after = a.current;
    if (!before || !after) return;
    if (playing) {
      before.pause();
      after.pause();
      setPlaying(false);
      return;
    }
    before.currentTime = after.currentTime;
    before.muted = true; // one soundtrack only
    const res = await Promise.allSettled([after.play(), before.play()]);
    setPlaying(res.some((r) => r.status === "fulfilled"));
  };

  const video = (id: string, ref: React.RefObject<HTMLVideoElement | null>, label: string, ai: boolean, controls: boolean) => (
    <figure className="min-w-0 flex-1 space-y-1">
      <div className="relative overflow-hidden rounded-xl bg-black" style={{ aspectRatio: ratio, maxHeight: 560 }}>
        <video ref={ref} src={src(id, "preview")} poster={src(id, "poster")} playsInline controls={controls} preload="metadata" className="size-full object-contain" onEnded={() => setPlaying(false)} />
        {ai && (
          <span className="absolute start-2 top-2">
            <Badge variant="gold"><Sparkles className="size-3" aria-hidden />תוכן AI</Badge>
          </span>
        )}
      </div>
      <figcaption className="text-center text-xs text-ash">{label}</figcaption>
    </figure>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-coal p-1" role="tablist" aria-label="תצוגה">
        {([["after", "אחרי"], ["before", "לפני"], ["compare", "השוואה"]] as const).map(([m, label]) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setPlaying(false);
            }}
            className={cn("flex-1 rounded-lg px-3 py-2 text-sm", mode === m ? "bg-gold/15 text-gold" : "text-ash")}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "after" && video(afterId, a, "אחרי החלפת הפנים", true, true)}
      {mode === "before" && video(beforeId, b, "הסרטון המקורי", false, true)}
      {mode === "compare" && (
        <>
          <div className="flex flex-col gap-3 md:flex-row">
            {video(beforeId, b, "לפני", false, false)}
            {video(afterId, a, "אחרי", true, false)}
          </div>
          <Button onClick={toggleBoth} className="w-full" variant="outline">
            {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            {playing ? "השהיה" : "ניגון שניהם יחד"}
          </Button>
        </>
      )}
      <Button asChild className="w-full">
        <a href={`${src(afterId, "original")}&download=1`}>
          <Download aria-hidden />
          הורדת התוצאה (MP4)
        </a>
      </Button>
    </div>
  );
}
