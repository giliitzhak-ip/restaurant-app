"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, History, ImageOff, Pencil, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { formatArea, formatDate, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  addDesignToCartAction,
  deleteDesignAction,
  deleteDesignImageAction,
  deleteDesignVersionAction,
  duplicateDesignAction,
  listDesignVersionsAction,
  renameDesignAction,
  restoreDesignVersionAction,
  saveDesignVersionAction,
} from "@/server/actions/designs";
import type { DesignVersionRecord } from "@/server/repositories/types";
import type { RoomDesignSummary } from "@/types/design";

type Action =
  | "rename"
  | "cart"
  | "duplicate"
  | "image"
  | "delete"
  | "versions"
  | "keep"
  | "restore";

export function DesignCard({
  design,
  index,
}: {
  design: RoomDesignSummary;
  index?: number;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(design.name);
  /*
   * Which action is in flight, not merely that one is. The card has five
   * buttons sharing one handler; a single boolean put a spinner on all five
   * and left no way to tell which one had been pressed.
   */
  const [running, setRunning] = React.useState<Action | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const image = design.renderedImageUrl || design.originalImageUrl;
  const busy = running !== null;

  /*
   * Versions are loaded on demand rather than with the card. Most designs
   * have none, and a listing page showing a dozen cards should not fetch a
   * dozen empty lists to prove it.
   */
  const [versions, setVersions] = React.useState<DesignVersionRecord[] | null>(null);

  const loadVersions = async () => {
    setRunning("versions");
    const result = await listDesignVersionsAction(design.id);
    setVersions(result.ok ? result.versions : []);
    setRunning(null);
  };

  const run = async (action: Action, work: () => Promise<unknown>) => {
    setRunning(action);
    await work();
    setRunning(null);
    router.refresh();
  };

  return (
    <Card as="article" enter index={index} className="overflow-hidden">
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
              await run("rename", () => renameDesignAction(design.id, name));
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
            <Button type="submit" size="sm" loading={running === "rename"}>
              {t.common.save}
            </Button>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[0.9375rem] font-medium text-ink">{design.name}</h3>
            <IconButton
              size="iconSm"
              label={`${t.common.edit} — ${design.name}`}
              className="-me-1 shrink-0 text-muted"
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </IconButton>
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
            disabled={busy}
            loading={running === "cart"}
            onClick={() =>
              run("cart", async () => {
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
          <IconButton
            size="iconSm"
            label={t.common.duplicate}
            disabled={busy}
            loading={running === "duplicate"}
            onClick={() => run("duplicate", () => duplicateDesignAction(design.id))}
          >
            <Copy />
          </IconButton>
          {image ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              loading={running === "image"}
              onClick={() =>
                run("image", async () => {
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
            disabled={busy}
            loading={running === "keep"}
            onClick={() =>
              run("keep", async () => {
                const result = await saveDesignVersionAction(design.id);
                toast(
                  result.ok
                    ? { title: "הגרסה נשמרה" }
                    : { tone: "error", title: t.states.errorTitle },
                );
                if (result.ok && versions) await loadVersions();
              })
            }
          >
            <History />
            שמירת גרסה
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            loading={running === "versions"}
            aria-expanded={versions !== null}
            onClick={() => (versions === null ? void loadVersions() : setVersions(null))}
          >
            גרסאות
          </Button>
          <IconButton
            size="iconSm"
            label={t.common.delete}
            disabled={busy}
            loading={running === "delete"}
            className="text-danger"
            onClick={() => {
              if (!window.confirm(t.admin.confirmDelete)) return;
              void run("delete", () => deleteDesignAction(design.id));
            }}
          >
            <Trash2 />
          </IconButton>
        </div>
        {versions !== null ? (
          <div className="enter-soft mt-3 border-t border-line pt-3">
            {versions.length === 0 ? (
              <p className="text-xs text-muted">
                אין גרסאות שמורות. ״שמירת גרסה״ שומרת את המצב הנוכחי כדי לחזור אליו.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {versions.map((version) => (
                  <li
                    key={version.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="num truncate text-xs text-muted">
                      {version.label || formatDate(version.createdAt)}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        loading={running === "restore"}
                        onClick={() =>
                          run("restore", async () => {
                            const result = await restoreDesignVersionAction(version.id);
                            toast(
                              result.ok
                                ? { title: "הגרסה שוחזרה" }
                                : { tone: "error", title: t.states.errorTitle },
                            );
                          })
                        }
                      >
                        <RotateCcw />
                        שחזור
                      </Button>
                      <IconButton
                        size="iconSm"
                        label="מחיקת הגרסה"
                        className="text-danger"
                        disabled={busy}
                        onClick={() =>
                          run("restore", async () => {
                            await deleteDesignVersionAction(version.id);
                            await loadVersions();
                          })
                        }
                      >
                        <Trash2 />
                      </IconButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
