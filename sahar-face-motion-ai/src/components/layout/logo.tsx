import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="SAHAR FACE MOTION AI — דף הבית">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-gold-light via-gold to-gold-dark text-lg font-black text-ink">
        S
      </span>
      <span dir="ltr" className="leading-none">
        <span className="gold-text block text-sm font-black tracking-[0.2em]">SAHAR</span>
        <span className="block text-[10px] tracking-[0.25em] text-ash">FACE MOTION AI</span>
      </span>
    </Link>
  );
}
