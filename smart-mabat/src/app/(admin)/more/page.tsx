import Link from "next/link";
import { logout } from "@/actions/auth";
import { EXTRA } from "@/components/nav-links";

export default function MorePage() {
  return (
    <div className="space-y-3">
      <h1 className="h1 mb-4">עוד</h1>
      {EXTRA.map(({ href, label, Icon }) => (
        <Link key={href} href={href} className="card flex items-center gap-3 py-4 hover:border-tech/40">
          <Icon className="h-6 w-6 text-tech-glow" />
          <span className="flex-1 font-medium">{label}</span>
          <span className="text-mute">‹</span>
        </Link>
      ))}
      <form action={logout} className="pt-4">
        <button className="btn-ghost w-full">יציאה</button>
      </form>
    </div>
  );
}
