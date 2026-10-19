import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logoutAction } from '@/lib/auth/actions';

export function UserPanel({
  name,
  email,
  signedInAs,
  logoutLabel,
}: {
  name: string;
  email: string;
  signedInAs: string;
  logoutLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{signedInAs}</p>
        <p className="truncate text-sm font-medium" data-testid="current-user-name">
          {name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          <bdi>{email}</bdi>
        </p>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="outline" size="sm" className="w-full">
          <LogOut aria-hidden className="rtl:-scale-x-100" />
          {logoutLabel}
        </Button>
      </form>
    </div>
  );
}
