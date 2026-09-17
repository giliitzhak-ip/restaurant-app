import { Info } from 'lucide-react';

/**
 * Shown wherever an action needs Supabase but it is not configured. Being
 * explicit beats a form that silently does nothing.
 */
export function DemoNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
    >
      <Info className="size-5 shrink-0 text-warning" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold">מצב הדגמה</p>
        <p className="text-muted-foreground">
          {children ??
            'חיבור Supabase לא הוגדר. העתק את .env.example ל-.env.local, מלא את המפתחות והרץ את המיגרציות כדי להפעיל התחברות ונתונים אמיתיים.'}
        </p>
      </div>
    </div>
  );
}
