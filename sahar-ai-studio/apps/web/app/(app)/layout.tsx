import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { requireUser } from '@/lib/auth/session';
import { getI18n } from '@/lib/i18n/server';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const { t } = await getI18n();
  return (
    <AppShell t={t} user={{ name: user.name, email: user.email }}>
      {children}
    </AppShell>
  );
}
