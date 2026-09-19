"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { commerce } from "@/config/brand";
import { t } from "@/i18n";
import { formatArea, formatPrice, roundTo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCart } from "@/features/cart/cart-provider";
import type { Product } from "@/types/catalog";

interface Room {
  id: string;
  name: string;
  length: string;
  width: string;
  area: string;
}

/** Ids must be stable between server and client, so they are derived from
 *  React's `useId` rather than generated randomly. */
const emptyRoom = (index: number, prefix: string): Room => ({
  id: `${prefix}-room-${index}`,
  name: index === 0 ? "סלון" : `חדר ${index + 1}`,
  length: "",
  width: "",
  area: "",
});

const toNumber = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * Quantity calculator.
 *
 * Packages are sold whole, so the honest answer to "how much do I need" is
 * always three numbers: the measured area, the area plus a waste allowance,
 * and the number of boxes that actually covers it. Multiple rooms add up into
 * a single order, which is how customers really buy.
 */
export function QuantityCalculator({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  const idPrefix = React.useId();
  const [mode, setMode] = React.useState<"dimensions" | "area">("dimensions");
  const [rooms, setRooms] = React.useState<Room[]>(() => [emptyRoom(0, idPrefix)]);
  const roomCounter = React.useRef(1);
  const [waste, setWaste] = React.useState<number>(commerce.defaultWastePercent);
  const { add, pending } = useCart();

  const coverage = product.packageCoverageSqm ?? 0;

  const roomAreas = rooms.map((room) =>
    mode === "dimensions"
      ? roundTo(toNumber(room.length) * toNumber(room.width), 2)
      : roundTo(toNumber(room.area), 2),
  );
  const totalArea = roundTo(
    roomAreas.reduce((sum, area) => sum + area, 0),
    2,
  );
  const areaWithWaste = roundTo(totalArea * (1 + waste / 100), 2);
  const packages = coverage > 0 ? Math.ceil(areaWithWaste / coverage) : Math.ceil(areaWithWaste);
  const total = packages * product.pricePerUnit;
  const covered = coverage > 0 ? roundTo(packages * coverage, 2) : packages;
  const hasArea = totalArea > 0;

  const update = (id: string, patch: Partial<Room>) => {
    setRooms((current) =>
      current.map((room) => (room.id === id ? { ...room, ...patch } : room)),
    );
  };

  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-surface p-5 md:p-6",
        compact && "p-4 md:p-5",
      )}
      aria-labelledby="calculator-title"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="calculator-title" className="font-display text-xl text-ink">
            {t.calculator.title}
          </h2>
          <p className="mt-1 text-xs text-muted">{t.calculator.subtitle}</p>
        </div>
        {/*
          A two-way mode switch, not a tab set: there are no panels behind it,
          the same fields stay on screen either way. Built with Tabs it emitted
          `aria-controls` pointing at panels that do not exist, which is a real
          WCAG 4.1.2 failure — a screen reader is promised a region and then
          cannot find it. Buttons with `aria-pressed` say what this actually is.
        */}
        <div
          role="group"
          aria-label={t.calculator.title}
          className="flex shrink-0 gap-4"
        >
          {(
            [
              ["dimensions", t.calculator.byDimensions],
              ["area", t.calculator.byArea],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                "-mb-px shrink-0 border-b-2 pb-1.5 text-sm transition-colors",
                mode === value
                  ? "border-ink text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-5 space-y-4">
        {rooms.map((room, index) => (
          <li key={room.id} className="rounded-sm border border-line bg-canvas p-3.5">
            <div className="flex items-center gap-2">
              <Input
                value={room.name}
                onChange={(event) => update(room.id, { name: event.target.value })}
                aria-label={t.calculator.roomName}
                className="h-9 max-w-40 border-transparent bg-transparent px-1.5 text-sm font-medium hover:border-line-strong"
              />
              <span className="num ms-auto text-xs text-muted">
                {roomAreas[index] ? formatArea(roomAreas[index]!) : "—"}
              </span>
              {rooms.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setRooms((current) => current.filter((entry) => entry.id !== room.id))
                  }
                  aria-label={t.calculator.removeRoom}
                  className="rounded-xs p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {mode === "dimensions" ? (
                <>
                  <div>
                    <Label htmlFor={`${room.id}-length`}>{t.calculator.length}</Label>
                    <Input
                      id={`${room.id}-length`}
                      data-testid="calc-length"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={room.length}
                      onChange={(event) =>
                        update(room.id, { length: event.target.value })
                      }
                      className="num"
                      placeholder="4.20"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${room.id}-width`}>{t.calculator.width}</Label>
                    <Input
                      id={`${room.id}-width`}
                      data-testid="calc-width"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={room.width}
                      onChange={(event) => update(room.id, { width: event.target.value })}
                      className="num"
                      placeholder="3.05"
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <Label htmlFor={`${room.id}-area`}>{t.calculator.area}</Label>
                  <Input
                    id={`${room.id}-area`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={room.area}
                    onChange={(event) => update(room.id, { area: event.target.value })}
                    className="num"
                    placeholder="12.8"
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() =>
          setRooms((current) => [
            ...current,
            emptyRoom(roomCounter.current++, idPrefix),
          ])
        }
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-brass transition-opacity hover:opacity-75"
      >
        <Plus className="size-4" />
        {t.calculator.addRoom}
      </button>

      <fieldset className="mt-6">
        <legend className="text-[0.8125rem] font-medium text-ink-soft">
          {t.calculator.waste}
        </legend>
        <p className="mb-2.5 mt-1 text-xs text-muted">{t.calculator.wasteHint}</p>
        <RadioGroup
          value={String(waste)}
          onValueChange={(value) => setWaste(Number(value))}
          className="flex gap-2"
        >
          {commerce.wasteOptions.map((option) => (
            <label
              key={option}
              className={cn(
                "num flex cursor-pointer items-center gap-2 rounded-sm border px-3.5 py-2 text-sm transition-colors",
                waste === option
                  ? "border-ink bg-brass-wash/50 text-ink"
                  : "border-line-strong text-ink-soft hover:border-ink",
              )}
            >
              <RadioGroupItem value={String(option)} className="sr-only" />
              {option}%
            </label>
          ))}
        </RadioGroup>
      </fieldset>

      {/* ------------------------------ result ------------------------------ */}
      <div
        aria-live="polite"
        className="mt-6 rounded-sm border border-line-strong bg-brass-wash/40 p-4"
      >
        {!hasArea ? (
          <p className="text-sm text-muted">{t.calculator.emptyHint}</p>
        ) : (
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">
                {rooms.length > 1 ? "שטח כולל" : t.calculator.roomArea}
              </dt>
              <dd className="num font-medium text-ink">{formatArea(totalArea)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">{t.calculator.withWaste(waste)}</dt>
              <dd className="num font-medium text-ink">{formatArea(areaWithWaste)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-line-strong pt-2.5">
              <dt className="text-muted">{t.calculator.packagesNeeded}</dt>
              <dd className="num text-base font-medium text-ink" data-testid="calc-units">
                {t.calculator.packagesUnit(packages)}
                {coverage > 0 ? (
                  <span className="ms-1.5 text-xs text-muted">
                    ({formatArea(covered)})
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted">{t.calculator.totalPrice}</dt>
              <dd className="num font-display text-2xl text-ink">
                {formatPrice(total)}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <Button
        block
        className="mt-4"
        disabled={!hasArea || pending || product.availability === "OUT_OF_STOCK"}
        onClick={async () => {
          track("calculate_area", {
            areaSqm: totalArea,
            packages,
            wastePercent: waste,
            rooms: rooms.length,
          });
          await add({
            productId: product.id,
            slug: product.slug,
            name: product.name,
            sqm: areaWithWaste,
          });
        }}
      >
        {t.calculator.addCalculatedToCart}
      </Button>
    </section>
  );
}
