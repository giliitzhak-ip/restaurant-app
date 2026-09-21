import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-card border border-dashed border-ink-200 bg-ink-50/60 px-6 py-14 text-center', className)}>
      {icon && <div className="mb-4 text-ink-400" aria-hidden>{icon}</div>}
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
