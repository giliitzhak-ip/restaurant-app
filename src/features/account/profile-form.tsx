"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
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
        toast(
          result.ok
            ? { title: t.admin.saved }
            : { tone: "error", title: t.states.errorTitle },
        );
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
      <Button type="submit" loading={pending} loadingLabel={t.common.saving}>
        {t.common.save}
      </Button>
    </form>
  );
}
