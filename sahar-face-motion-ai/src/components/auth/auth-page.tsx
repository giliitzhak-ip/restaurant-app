import { Card } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { AiDisclosure } from "@/components/layout/ai-disclosure";

export function AuthPage({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.12),transparent_60%)]">
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
        <div className="mb-8">
          <Logo />
        </div>
        <Card className="w-full max-w-md p-6 sm:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-ash">{subtitle}</p>
          {children}
        </Card>
      </div>
      <AiDisclosure />
    </div>
  );
}
