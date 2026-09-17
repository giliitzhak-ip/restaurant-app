import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import type { Availability } from "@/types/catalog";

const map: Record<
  Availability,
  { label: string; variant: "success" | "warning" | "neutral" | "danger" }
> = {
  IN_STOCK: { label: t.common.inStock, variant: "success" },
  LOW_STOCK: { label: t.common.lowStock, variant: "warning" },
  MADE_TO_ORDER: { label: t.common.madeToOrder, variant: "neutral" },
  OUT_OF_STOCK: { label: t.common.outOfStock, variant: "danger" },
};

export function AvailabilityBadge({
  availability,
  leadTimeDays,
}: {
  availability: Availability;
  leadTimeDays?: number;
}) {
  const entry = map[availability];
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={entry.variant}>{entry.label}</Badge>
      {leadTimeDays !== undefined && availability !== "OUT_OF_STOCK" ? (
        <span className="num text-xs text-muted">
          אספקה {leadTimeDays} ימי עסקים
        </span>
      ) : null}
    </span>
  );
}
