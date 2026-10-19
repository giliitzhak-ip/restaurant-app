import Link from 'next/link';

export function Brand() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-3 rounded-md"
      aria-label="SAHAR AI STUDIO"
    >
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-lg border border-gold-500/40 bg-gradient-to-br from-gold-400/25 to-transparent text-lg font-bold text-gold-300"
      >
        S
      </span>
      <span className="flex flex-col leading-none" dir="ltr">
        <span className="gold-gradient-text text-base font-bold tracking-[0.2em]">SAHAR</span>
        <span className="mt-1 text-[0.65rem] font-medium tracking-[0.35em] text-muted-foreground">
          AI STUDIO
        </span>
      </span>
    </Link>
  );
}
