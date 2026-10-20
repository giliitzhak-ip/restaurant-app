import { AppShell } from "@/components/layout/app-shell";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { DeleteAccount } from "@/components/auth/delete-account";
import { requireUser } from "@/lib/require-user";
import { db } from "@/lib/db";
import { BudgetForm } from "@/components/auth/budget-form";
import { budgetStatus, freeMode, maxUserBudgetCents } from "@/server/billing";

export const metadata = { title: "החשבון שלי | SAHAR FACE MOTION AI" };

const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jerusalem" });

export default async function AccountPage() {
  const user = await requireUser("/account");
  const budget = await budgetStatus(user.id);
  const details = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { createdAt: true, termsAcceptedAt: true, _count: { select: { projects: true, sessions: true } } },
  });

  return (
    <AppShell user={user}>
      <h1 className="mb-6 text-2xl font-bold">החשבון שלי</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-4">פרטים</CardTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ash">שם</dt>
            <dd>{user.name}</dd>
            <dt className="text-ash">אימייל</dt>
            <dd dir="ltr" className="text-right">{user.email}</dd>
            <dt className="text-ash">נוצר</dt>
            <dd>{fmt.format(details.createdAt)}</dd>
            <dt className="text-ash">אישור תנאים</dt>
            <dd>{fmt.format(details.termsAcceptedAt)}</dd>
            <dt className="text-ash">פרויקטים</dt>
            <dd>{details._count.projects}</dd>
            <dt className="text-ash">התחברויות פעילות</dt>
            <dd>{details._count.sessions}</dd>
          </dl>
        </Card>
        <Card className="space-y-4">
          <div>
            <CardTitle>תקציב ועלויות AI</CardTitle>
            <CardDescription>הגבלת ההוצאה החודשית על שירותי AI בתשלום.</CardDescription>
          </div>
          <BudgetForm initial={budget} maxCents={maxUserBudgetCents()} freeMode={freeMode()} />
        </Card>
        <Card className="space-y-4">
          <div>
            <CardTitle>מחיקת מידע</CardTitle>
            <CardDescription>ניתן למחוק בכל עת את החשבון ואת כל המידע והקבצים המשויכים אליו.</CardDescription>
          </div>
          <DeleteAccount />
        </Card>
      </div>
    </AppShell>
  );
}
