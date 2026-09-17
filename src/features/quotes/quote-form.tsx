"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Paperclip } from "lucide-react";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitQuoteAction } from "@/server/actions/quotes";
import type { RoomDesignSummary } from "@/types/design";

interface Option {
  id: string;
  name: string;
  slug: string;
}

export function QuoteForm({
  products,
  defaultProductId,
  design,
  defaultAreaSqm,
}: {
  products: Option[];
  defaultProductId?: string;
  design?: RoomDesignSummary | null;
  defaultAreaSqm?: number;
}) {
  const [productId, setProductId] = React.useState(defaultProductId ?? "");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [state, setState] = React.useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [quoteNumber, setQuoteNumber] = React.useState("");
  const [fileName, setFileName] = React.useState("");

  if (state === "done") {
    return (
      <div className="rounded-lg border border-line bg-surface p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success text-white">
          <Check className="size-6" />
        </div>
        <h2 className="mt-5 text-2xl">{t.quote.successTitle}</h2>
        <p className="mt-2 text-sm text-muted">{t.quote.successBody}</p>
        <p className="num mt-4 text-sm text-ink">
          {t.checkout.orderNumber}: {quoteNumber}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link href={routes.catalog}>{t.checkout.backToStore}</Link>
          </Button>
          <Button variant="outline" onClick={() => setState("idle")}>
            {t.quote.newRequest}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      action={async (formData) => {
        setState("sending");
        setErrors({});
        if (design) formData.set("designId", design.id);
        formData.set("productId", productId);
        const result = await submitQuoteAction(formData);
        if (!result.ok) {
          setErrors(result.fieldErrors ?? {});
          setState("error");
          return;
        }
        track("request_quote", {
          productSlug: products.find((item) => item.id === productId)?.slug ?? null,
          areaSqm: Number(formData.get("areaSqm")) || null,
          withDesign: Boolean(design),
        });
        setQuoteNumber(result.number);
        setState("done");
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t.checkout.fullName}
          htmlFor="q-name"
          required
          error={errors.fullName?.[0]}
        >
          <Input id="q-name" name="fullName" autoComplete="name" required />
        </Field>
        <Field
          label={t.checkout.phone}
          htmlFor="q-phone"
          required
          error={errors.phone?.[0]}
        >
          <Input
            id="q-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="050-0000000"
            className="num"
            required
          />
        </Field>
        <Field label={t.checkout.email} htmlFor="q-email" error={errors.email?.[0]}>
          <Input id="q-email" name="email" type="email" autoComplete="email" />
        </Field>
        <Field label={t.quote.city} htmlFor="q-city" required error={errors.city?.[0]}>
          <Input id="q-city" name="city" autoComplete="address-level2" required />
        </Field>
        <Field label={t.quote.sqm} htmlFor="q-area" error={errors.areaSqm?.[0]}>
          <Input
            id="q-area"
            name="areaSqm"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            defaultValue={defaultAreaSqm ? defaultAreaSqm.toFixed(1) : ""}
            className="num"
          />
        </Field>
        <div>
          <span className="mb-1.5 block text-[0.8125rem] font-medium text-ink-soft">
            {t.quote.product}
          </span>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger aria-label={t.quote.product}>
              <SelectValue placeholder={t.quote.productAny} />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {design ? (
        <div className="flex items-center gap-3 rounded-sm border border-line bg-brass-wash/40 p-3.5">
          <span className="relative size-14 shrink-0 overflow-hidden rounded-xs bg-surface-2">
            {design.renderedImageUrl || design.originalImageUrl ? (
              <Image
                src={design.renderedImageUrl || design.originalImageUrl}
                alt={design.name}
                fill
                sizes="56px"
                className="object-cover"
                unoptimized
              />
            ) : null}
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{t.quote.attachedDesign}</p>
            <p className="text-xs text-muted">{design.name}</p>
          </div>
        </div>
      ) : (
        <Field
          label={t.quote.attachImage}
          htmlFor="q-image"
          hint={t.quote.attachImageHint}
        >
          <label
            htmlFor="q-image"
            className="flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line-strong bg-surface px-4 py-3 text-sm text-muted transition-colors hover:border-ink hover:text-ink"
          >
            <Paperclip className="size-4" />
            {fileName || "בחרו תמונה מהמכשיר"}
            <input
              id="q-image"
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
            />
          </label>
        </Field>
      )}

      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-soft">
        <Checkbox name="wantsInstallation" />
        {t.quote.wantInstallation}
      </label>

      <Field label={t.quote.notes} htmlFor="q-notes" hint={t.quote.notesPlaceholder}>
        <Textarea id="q-notes" name="notes" rows={4} />
      </Field>

      {state === "error" && !Object.keys(errors).length ? (
        <p role="alert" className="text-sm text-danger">
          {t.states.errorBody}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={state === "sending"}>
        {state === "sending" ? t.quote.submitting : t.quote.submit}
      </Button>
      <p className="text-xs text-muted">
        בשליחה אתם מאשרים שניצור קשר בטלפון או במייל. הפרטים נשמרים לפי{" "}
        <Link href={routes.privacy} className="link-quiet underline">
          מדיניות הפרטיות
        </Link>
        .
      </p>
    </form>
  );
}
