"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { setStockAction } from "@/server/actions/admin";

export function StockInput({ id, value }: { id: string; value: number }) {
  const [stock, setStock] = React.useState(String(value));
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const dirty = Number(stock) !== value;

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        await setStockAction(id, Number(stock));
        setPending(false);
        toast({ title: t.admin.saved });
        router.refresh();
      }}
    >
      <Input
        type="number"
        min="0"
        value={stock}
        onChange={(event) => setStock(event.target.value)}
        aria-label={`${t.admin.inventory} — ${id}`}
        className="num h-9 w-24"
      />
      <Button
        type="submit"
        size="iconSm"
        variant={dirty ? "primary" : "ghost"}
        disabled={!dirty || pending}
        aria-label={t.common.save}
      >
        <Check />
      </Button>
    </form>
  );
}
