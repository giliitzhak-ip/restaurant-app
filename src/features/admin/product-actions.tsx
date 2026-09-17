"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  deleteProductAction,
  duplicateProductAction,
} from "@/server/actions/admin";

export function ProductRowActions({
  id,
  slug,
}: {
  id: string;
  slug: string;
}) {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  return (
    <div className="flex items-center gap-1">
      <Button asChild size="iconSm" variant="ghost" aria-label={t.common.edit}>
        <Link href={routes.admin.product(id)}>
          <Pencil />
        </Link>
      </Button>
      <Button asChild size="iconSm" variant="ghost" aria-label="צפייה באתר">
        <Link href={routes.product(slug)} target="_blank">
          <ExternalLink />
        </Link>
      </Button>
      <Button
        size="iconSm"
        variant="ghost"
        aria-label={t.common.duplicate}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await duplicateProductAction(id);
          setPending(false);
          if (result.ok && result.data) {
            toast({ title: t.common.duplicate });
            router.push(routes.admin.product(result.data.id));
          }
        }}
      >
        <Copy />
      </Button>
      <Button
        size="iconSm"
        variant="ghost"
        aria-label={t.common.delete}
        disabled={pending}
        className="text-danger"
        onClick={async () => {
          if (!window.confirm(t.admin.confirmDelete)) return;
          setPending(true);
          await deleteProductAction(id);
          setPending(false);
          toast({ title: t.admin.deleted });
          router.refresh();
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
