"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-bold">אירעה שגיאה בטעינת הדף</h1>
        <p className="mt-2 text-sm text-ash">ייתכן שיש תקלה זמנית בשרת. נסו שוב בעוד רגע.</p>
        <Button className="mt-6" onClick={reset}>ניסיון חוזר</Button>
      </div>
    </div>
  );
}
