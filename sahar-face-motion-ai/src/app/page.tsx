import Link from "next/link";
import { ScanFace, PersonStanding, AudioLines, MessageSquareText, Clapperboard, FolderKanban } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { AiDisclosure } from "@/components/layout/ai-disclosure";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { STUDIO_MODULES } from "@/lib/modules";
import { getCurrentUser } from "@/lib/session";

const ICONS = {
  projects: FolderKanban,
  "face-swap": ScanFace,
  voice: AudioLines,
  "lip-sync": MessageSquareText,
  motion: PersonStanding,
  editor: Clapperboard,
} as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await getCurrentUser();
  const { deleted } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.14),transparent_55%)]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Logo />
        <div className="flex gap-2">
          {user ? (
            <Button asChild size="sm"><Link href="/dashboard">לסטודיו</Link></Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost"><Link href="/login">התחברות</Link></Button>
              <Button asChild size="sm"><Link href="/register">הרשמה</Link></Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4">
        {deleted && <Alert variant="info" className="mt-4">החשבון וכל המידע המשויך אליו נמחקו.</Alert>}
        <section className="py-14 text-center sm:py-20">
          <h1 dir="ltr" className="text-4xl font-black tracking-tight sm:text-6xl">
            <span className="gold-text">SAHAR</span> FACE MOTION AI
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ash">
            סטודיו מקצועי ליצירת סרטוני AI: החלפת פנים, הנפשת תנועה, קולות סינתטיים בעברית, סנכרון שפתיים ועריכת וידאו, הכול במקום אחד ובהסכמה מלאה.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg"><Link href={user ? "/dashboard" : "/register"}>מתחילים ליצור</Link></Button>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-3">
          {STUDIO_MODULES.map((m) => {
            const Icon = ICONS[m.slug as keyof typeof ICONS];
            return (
              <Card key={m.slug} className="space-y-2">
                <Icon className="size-7 text-gold" aria-hidden />
                <CardTitle dir="auto">{m.title}</CardTitle>
                <CardDescription>{m.description}</CardDescription>
              </Card>
            );
          })}
        </section>
      </main>
      <AiDisclosure />
    </div>
  );
}
