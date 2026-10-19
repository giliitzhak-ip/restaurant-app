'use client';

import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';

/** Submit button that asks for confirmation first (native dialog — works on iPhone). */
export function ConfirmSubmit({
  message,
  ...props
}: ComponentProps<typeof Button> & { message: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
        props.onClick?.(event);
      }}
    />
  );
}
