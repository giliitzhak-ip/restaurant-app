"use client";

import { useActionState } from "react";
import { login } from "@/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="email">
          אימייל
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" dir="ltr" defaultValue={state?.email} />
      </div>
      <div>
        <label className="label" htmlFor="password">
          סיסמה
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" dir="ltr" />
      </div>
      {state?.error && <p className="text-sm text-red-300">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "מתחבר…" : "כניסה"}
      </button>
    </form>
  );
}
