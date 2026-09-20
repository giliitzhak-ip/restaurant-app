"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { routes } from "@/config/site";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { loginAction, registerAction } from "@/server/actions/auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [message, setMessage] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage("");
    const data = new FormData(event.currentTarget);

    const result =
      mode === "login"
        ? await loginAction({
            email: String(data.get("email") ?? ""),
            password: String(data.get("password") ?? ""),
          })
        : await registerAction({
            email: String(data.get("email") ?? ""),
            password: String(data.get("password") ?? ""),
            fullName: String(data.get("fullName") ?? ""),
            phone: String(data.get("phone") ?? ""),
          });

    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      /*
       * Both auth failures answer with the same kind of message on purpose:
       * "this email is already registered" tells anyone with a list of
       * addresses which of them shop here.
       */
      setMessage(
        result.error === "INVALID_CREDENTIALS"
          ? t.account.invalidCredentials
          : result.error === "REGISTRATION_REJECTED"
            ? t.account.registrationRejected
            : result.error === "RATE_LIMITED"
              ? t.account.tooManyAttempts
              : "",
      );
      return;
    }

    router.push(next && next.startsWith("/") ? next : routes.account.root);
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {mode === "register" ? (
        <>
          <Field
            label={t.checkout.fullName}
            htmlFor="fullName"
            required
            error={errors.fullName?.[0]}
          >
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </Field>
          <Field label={t.checkout.phone} htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="num"
            />
          </Field>
        </>
      ) : null}

      <Field
        label={t.checkout.email}
        htmlFor="email"
        required
        error={errors.email?.[0]}
      >
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        label={t.account.password}
        htmlFor="password"
        required
        error={errors.password?.[0]}
        hint={mode === "register" ? "8 תווים לפחות" : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
        />
      </Field>

      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}

      <Button type="submit" block size="lg" loading={pending}>
        {mode === "login" ? t.nav.login : t.nav.register}
      </Button>

      <p className="text-center text-sm text-muted">
        {mode === "login" ? t.account.noAccount : t.account.hasAccount}{" "}
        <Link
          href={mode === "login" ? routes.register : routes.login}
          className="link-quiet text-ink"
        >
          {mode === "login" ? t.nav.register : t.nav.login}
        </Link>
      </p>
    </form>
  );
}
