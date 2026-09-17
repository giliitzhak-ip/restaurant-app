"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ImageOff, Pencil, ShoppingBag, Trash2 } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatDate, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  addDesignToCartAction,
  deleteDesignAction,
  deleteDesignImageAction,
  duplicateDesignAction,
  renameDesignAction,
} from "@/server/actions/designs";
import type { RoomDesignSummary } from "@/types/design";

export function DesignCard({ design }: { design: RoomDesignSummary }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(design.name);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const image = design.renderedImageUrl || design.originalImageUrl;

  const run = async (work: () => Promise<unknown>) => {
    setPending(true);
    await work();
    setPending(false);
    router.refresh();
  };

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="relative aspect-3/2 bg-surface-2">
        {image ? (
          <Image
            src={image}
            alt={design.name}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted">
            <ImageOff className="size-5" />
            <span className="text-xs">התמונה נמחקה</span>
          </div>
        )}
      </div>

      <div className="p-4">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await run(() => renameDesignAction(design.id, name));
              setEditing(false);
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={t.designer.designNameLabel}
              className="h-9"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={pending}>
              {t.common.save}
            </Button>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[0.9375rem] font-medium text-ink">{design.name}</h3>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t.common.edit}
              className="rounded-xs p-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <Pencil className="size-3.5" />
            </button>
          </div>
        )}

        <p className="num mt-1 text-xs text-muted">{formatDate(design.updatedAt)}</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {design.floorProductName ? (
            <Badge variant="neutral">
              {t.designer.selectedFloor}: {design.floorProductName}
            </Badge>
          ) : null}
          {design.wallProductName ? (
            <Badge variant="neutral">
              {t.designer.selectedWall}: {design.wallProductName}
            </Badge>
          ) : null}
        </div>

        <dl className="mt-3 flex gap-5 text-xs">
          <div>
            <dt className="text-muted">{t.designer.estimatedArea}</dt>
            <dd className="num mt-0.5 text-ink">
              {formatArea(design.estimatedAreaSqm)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">{t.designer.estimatedPrice}</dt>
            <dd className="num mt-0.5 text-ink">{formatPrice(design.estimatedPrice)}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await addDesignToCartAction(design.id);
                toast(
                  result.ok
                    ? { title: t.product.added }
                    : { tone: "error", title: t.states.errorTitle },
                );
              })
            }
          >
            <ShoppingBag />
            {t.designer.addToCart}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href={`${routes.designer}?design=${design.id}`}>{t.common.edit}</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => duplicateDesignAction(design.id))}
            aria-label={t.common.duplicate}
          >
            <Copy />
          </Button>
          {image ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await deleteDesignImageAction(design.id);
                  toast({ title: t.designer.deleteImage, tone: "info" });
                })
              }
            >
              <ImageOff />
              {t.designer.deleteImage}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t.admin.confirmDelete)) return;
              void run(() => deleteDesignAction(design.id));
            }}
            aria-label={t.common.delete}
            className="text-danger"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </article>
  );
}
