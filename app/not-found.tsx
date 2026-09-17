import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo size="lg" href={null} />
      <div className="space-y-2">
        <p className="text-5xl font-black">404</p>
        <h1 className="text-xl font-semibold">הדף שחיפשת לא נמצא</h1>
        <p className="text-muted-foreground">ייתכן שהקישור השתנה או שהדף הוסר.</p>
      </div>
      <Button asChild>
        <Link href="/">חזרה לדף הבית</Link>
      </Button>
    </main>
  );
}
