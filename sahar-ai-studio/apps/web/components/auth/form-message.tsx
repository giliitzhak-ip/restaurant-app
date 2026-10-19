import { AlertCircle } from 'lucide-react';

export function FormError({ message, id }: { message?: string | undefined; id?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      data-testid="form-error"
      className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

export function FieldError({ message, id }: { message?: string | undefined; id: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
