"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/actions/auth";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await logoutAction();
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut />
      {t.nav.logout}
    </Button>
  );
}
