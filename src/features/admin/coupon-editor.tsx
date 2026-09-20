"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { formatDate, formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { AdminCell, AdminTable } from "@/features/admin/admin-table";
import { saveCouponAction } from "@/server/actions/admin";
import type { Coupon } from "@/types/catalog";

export function CouponEditor({ coupons }: { coupons: Coupon[] }) {
  const [editing, setEditing] = React.useState<Coupon | null>(null);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const blank: Coupon = {
    id: "",
    code: "",
    kind: "PERCENT",
    value: 10,
    minSubtotal: null,
    active: true,
    expiresAt: null,
    usageCount: 0,
  };
  const form = editing ?? blank;

  const update = (patch: Partial<Coupon>) =>
    setEditing({ ...form, ...patch });

  return (
    <div className="space-y-8">
      <AdminTable head={["קוד", "הנחה", "מינימום", "תפוגה", "שימושים", "מצב", ""]}>
        {coupons.map((coupon) => (
          <tr key={coupon.id}>
            <AdminCell className="num font-medium">{coupon.code}</AdminCell>
            <AdminCell className="num">
              {coupon.kind === "PERCENT"
                ? `${coupon.value}%`
                : formatPrice(coupon.value)}
            </AdminCell>
            <AdminCell className="num text-muted">
              {coupon.minSubtotal ? formatPrice(coupon.minSubtotal) : "—"}
            </AdminCell>
            <AdminCell className="num text-muted">
              {coupon.expiresAt ? formatDate(coupon.expiresAt) : "—"}
            </AdminCell>
            <AdminCell className="num">{coupon.usageCount}</AdminCell>
            <AdminCell>
              <Badge variant={coupon.active ? "success" : "outline"}>
                {coupon.active ? t.admin.active : "כבוי"}
              </Badge>
            </AdminCell>
            <AdminCell>
              <Button size="sm" variant="ghost" onClick={() => setEditing(coupon)}>
                {t.common.edit}
              </Button>
            </AdminCell>
          </tr>
        ))}
      </AdminTable>

      <form
        className="space-y-4 card p-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          const result = await saveCouponAction({
            id: form.id || undefined,
            code: form.code,
            kind: form.kind,
            value: form.value,
            minSubtotal: form.minSubtotal,
            active: form.active,
            expiresAt: form.expiresAt,
          });
          setPending(false);
          toast(
            result.ok
              ? { title: t.admin.saved }
              : { tone: "error", title: t.states.errorTitle },
          );
          if (result.ok) {
            setEditing(null);
            router.refresh();
          }
        }}
      >
        <h2 className="text-lg">
          {form.id ? `${t.common.edit} ${form.code}` : "קוד הנחה חדש"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="קוד" htmlFor="cp-code" required>
            <Input
              id="cp-code"
              dir="ltr"
              value={form.code}
              onChange={(event) => update({ code: event.target.value.toUpperCase() })}
              required
            />
          </Field>
          <label className="block">
            <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink-soft">
              סוג
            </span>
            <select
              value={form.kind}
              onChange={(event) =>
                update({ kind: event.target.value as Coupon["kind"] })
              }
              className="h-11 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm"
            >
              <option value="PERCENT">אחוזים</option>
              <option value="FIXED">סכום קבוע</option>
            </select>
          </label>
          <Field label="ערך" htmlFor="cp-value" required>
            <Input
              id="cp-value"
              type="number"
              min="1"
              step="1"
              className="num"
              value={form.value}
              onChange={(event) => update({ value: Number(event.target.value) })}
              required
            />
          </Field>
          <Field label="מינימום לקנייה" htmlFor="cp-min">
            <Input
              id="cp-min"
              type="number"
              min="0"
              className="num"
              value={form.minSubtotal ?? ""}
              onChange={(event) =>
                update({
                  minSubtotal: event.target.value ? Number(event.target.value) : null,
                })
              }
            />
          </Field>
          <Field label="תפוגה" htmlFor="cp-exp">
            <Input
              id="cp-exp"
              type="date"
              className="num"
              value={form.expiresAt ? form.expiresAt.slice(0, 10) : ""}
              onChange={(event) =>
                update({
                  expiresAt: event.target.value
                    ? new Date(`${event.target.value}T20:59:59.000Z`).toISOString()
                    : null,
                })
              }
            />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-end gap-2 pb-3 text-sm text-ink-soft">
            <Checkbox
              checked={form.active}
              onCheckedChange={(checked) => update({ active: checked === true })}
            />
            {t.admin.active}
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={pending} loadingLabel={t.common.saving}>
            {t.common.save}
          </Button>
          {form.id ? (
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              {t.common.cancel}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
