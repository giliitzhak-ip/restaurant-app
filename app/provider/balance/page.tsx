import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BalancePanel } from '@/features/provider/components/balance-panel';
import { getServerDictionary } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'יתרה' };

export default async function ProviderBalancePage() {
  const { t } = await getServerDictionary();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t.provider.balance}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/provider/earnings">
            {t.provider.earnings}
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
      </div>
      <BalancePanel />
    </div>
  );
}
