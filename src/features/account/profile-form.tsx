"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useTransientFlag } from "@/components/ui/use-transient-flag";
import { updateProfileAction } from "@/server/actions/profile";

export function ProfileForm({
  fullName,
  phone,
  email,
}: {
  fullName: string;
  phone: string;
  email: string;
}) {
  const [pending, setPending] = React.useState(false);
  const [saved, markSaved] = useTransientFlag();
  const { toast } = useToast();
  const router = useRouter();

  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        const data = new FormData(event.currentTarget);
        const result = await updateProfileAction({
          fullName: String(data.get("fullName") ?? ""),
          phone: String(data.get("phone") ?? ""),
        });
        setPending(false);
        if (result.ok) {
          markSaved();
          toast({ title: t.admin.saved });
        } else {
          toast({ tone: "error", title: t.states.errorTitle });
        }
        router.refresh();
      }}
    >
      <Field label={t.checkout.fullName} htmlFor="p-name" required>
        <Input id="p-name" name="fullName" defaultValue={fullName} required />
      </Field>
      <Field label={t.checkout.phone} htmlFor="p-phone">
        <Input
          id="p-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={phone}
          className="num"
        />
      </Field>
      <Field label={t.checkout.email} htmlFor="p-email" hint="לא ניתן לשנות אימייל">
        <Input id="p-email" value={email} disabled />
      </Field>
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          loading={pending}
          loadingLabel={t.common.saving}
          success={saved}
        >
          {t.common.save}
        </Button>
        {saved ? (
          <span className="enter-soft text-xs text-success" role="status">
            {t.admin.saved}
          </span>
        ) : null}
      </div>
    </form>
  );
}
