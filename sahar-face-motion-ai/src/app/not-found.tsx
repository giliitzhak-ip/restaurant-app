import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="gold-text text-6xl font-black">404</p>
        <h1 className="mt-3 text-xl font-bold">הדף לא נמצא</h1>
        <Button asChild className="mt-6"><Link href="/">חזרה לדף הבית</Link></Button>
      </div>
    </div>
  );
}
