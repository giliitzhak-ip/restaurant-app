import { t } from "@/i18n";
import { formatDimensions, formatThickness } from "@/lib/format";
import {
  materialLabels,
  styleLabels,
  surfaceLabels,
  toneLabels,
  usageLabels,
  waterLabels,
} from "@/features/catalog/labels";
import type { Product } from "@/types/catalog";

export function SpecTable({ product }: { product: Product }) {
  const rows: { label: string; value: string }[] = [
    { label: t.product.sku, value: product.sku },
    { label: t.product.material, value: product.specs.materialLabel },
    {
      label: t.product.dimensions,
      value: formatDimensions(product.specs.widthMm, product.specs.lengthMm),
    },
    { label: t.product.thickness, value: formatThickness(product.specs.thicknessMm) },
    ...(product.specs.wearLayerMm
      ? [
          {
            label: "שכבת שחיקה",
            value: formatThickness(product.specs.wearLayerMm),
          },
        ]
      : []),
    ...(product.packageCoverageSqm
      ? [
          {
            label: t.product.packageCoverage,
            value: `${product.packageCoverageSqm} מ״ר`,
          },
        ]
      : []),
    { label: t.product.tone, value: `${product.specs.colorName} · ${toneLabels[product.specs.tone]}` },
    { label: t.product.texture, value: product.specs.textureLabel },
    { label: "חומר בסיס", value: materialLabels[product.specs.material] },
    { label: "סגנון", value: product.specs.style.map((style) => styleLabels[style]).join(" · ") },
    { label: t.catalog.groupSurface, value: surfaceLabels[product.specs.surface] },
    { label: t.product.durability, value: product.specs.durability },
    { label: t.catalog.groupWater, value: waterLabels[product.specs.waterResistance] },
    { label: t.catalog.groupUsage, value: usageLabels[product.specs.usage] },
    { label: "סוג התקנה", value: product.specs.installationType },
    ...(product.specs.underfloorHeating !== undefined
      ? [
          {
            label: "חימום תת־רצפתי",
            value: product.specs.underfloorHeating ? "מאושר" : "לא מאושר",
          },
        ]
      : []),
    ...(product.specs.acousticRating
      ? [{ label: "אקוסטיקה", value: product.specs.acousticRating }]
      : []),
    { label: t.product.warranty, value: `${product.specs.warrantyYears} שנים` },
    { label: t.product.leadTime, value: `${product.leadTimeDays} ימי עסקים` },
    { label: "מותג", value: product.brand },
  ];

  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-sm"
        >
          <dt className="shrink-0 text-muted">{row.label}</dt>
          <dd className="num text-end text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
