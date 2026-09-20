import { cn } from "@/lib/utils";

/** Compact table shell shared by every admin list. */
export function AdminTable({
  head,
  children,
  className,
  label,
}: {
  head: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
  /** Names the scrollable region. Falls back to a generic description. */
  label?: string;
}) {
  return (
    /*
     * A horizontally scrolling box has to be focusable, or the only way to
     * read the columns past the edge is to drag — which a keyboard cannot do.
     * The label is what a screen reader announces on landing here.
     */
    <div
      className={cn("card overflow-x-auto", className)}
      tabIndex={0}
      role="group"
      aria-label={label ?? "טבלת נתונים — ניתן לגלול לצדדים"}
    >
      <table className="w-full min-w-[42rem] text-sm">
        <thead>
          <tr className="border-b border-line text-start">
            {head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className="px-4 py-3 text-start text-xs font-medium text-muted"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function AdminCell({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function AdminPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
