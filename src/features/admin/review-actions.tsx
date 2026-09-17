"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { setReviewApprovalAction } from "@/server/actions/admin";

export function ReviewApproval({
  id,
  approved,
}: {
  id: string;
  approved: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();

  const set = async (value: boolean) => {
    setPending(true);
    await setReviewApprovalAction(id, value);
    setPending(false);
    router.refresh();
  };

  return (
    <div className="flex gap-1">
      <Button
        size="iconSm"
        variant={approved ? "primary" : "ghost"}
        disabled={pending}
        aria-label="אישור"
        onClick={() => set(true)}
      >
        <Check />
      </Button>
      <Button
        size="iconSm"
        variant={approved ? "ghost" : "danger"}
        disabled={pending}
        aria-label={t.common.remove}
        onClick={() => set(false)}
      >
        <X />
      </Button>
    </div>
  );
}
