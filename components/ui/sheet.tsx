'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Bottom drawer on mobile, centred modal from `sm` up. */
  variant?: 'drawer' | 'modal';
}

/**
 * Modal/drawer built on the native <dialog> element, so focus trapping, Esc to
 * close and inertness of the page behind come from the platform.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'drawer',
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      className={cn(
        'w-full max-w-lg bg-transparent p-0 text-foreground backdrop:bg-black/50',
        variant === 'drawer' ? 'm-0 mt-auto sm:m-auto' : 'm-auto',
      )}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div
        className={cn(
          'flex max-h-[85vh] flex-col overflow-hidden border bg-background shadow-xl',
          variant === 'drawer' ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-2xl',
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b p-4">
          <div className="space-y-1">
            <h2 id="sheet-title" className="text-base font-semibold">
              {title}
            </h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגירה">
            <X aria-hidden />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? <footer className="flex gap-2 border-t p-4">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
