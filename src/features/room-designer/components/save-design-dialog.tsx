"use client";

import * as React from "react";
import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function SaveDesignDialog({
  open,
  onOpenChange,
  defaultName,
  onSave,
  signedIn,
  pending,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  defaultName: string;
  onSave: (name: string) => Promise<void>;
  signedIn: boolean;
  pending: boolean;
}) {
  const [name, setName] = React.useState(defaultName);

  React.useEffect(() => {
    if (open) setName(defaultName);
  }, [defaultName, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t.designer.saveDesignTitle}</DialogTitle>
          <DialogDescription>
            {signedIn
              ? t.designer.privacyBody
              : "נשמור את העיצוב על המכשיר הזה. כדי לראות אותו בכל מכשיר — כדאי ליצור חשבון."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onSave(name.trim() || defaultName);
          }}
        >
          <Field label={t.designer.designNameLabel} htmlFor="design-name" required>
            <Input
              id="design-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t.designer.designNamePlaceholder}
              maxLength={80}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t.common.saving : t.common.save}
            </Button>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
