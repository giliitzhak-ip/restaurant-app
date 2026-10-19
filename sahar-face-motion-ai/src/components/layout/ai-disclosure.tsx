import { Sparkles } from "lucide-react";

/** Shown on every page: the platform produces synthetic media and labels it. */
export function AiDisclosure() {
  return (
    <footer className="border-t border-steel/60 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs leading-relaxed text-ash">
      <p className="inline-flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-gold" aria-hidden />
        כל תוכן שנוצר בפלטפורמה הוא תוכן סינתטי (AI) ומסומן ככזה. אין להציגו כהקלטה אותנטית.
      </p>
      <p className="mt-1">
        השימוש בפנים ובקולות של אנשים מותר רק בהסכמתם המפורשת.{" "}
        <a href="/terms" className="text-gold underline-offset-4 hover:underline">
          תנאי שימוש ומדיניות הסכמה
        </a>
      </p>
    </footer>
  );
}
