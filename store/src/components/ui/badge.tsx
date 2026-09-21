import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold leading-none',
  {
    variants: {
      tone: {
        neutral: 'bg-ink-100 text-ink-700',
        info: 'bg-sky-100 text-sky-800',
        success: 'bg-brand-100 text-brand-800',
        warning: 'bg-amber-100 text-amber-900',
        danger: 'bg-red-100 text-red-800',
        brand: 'bg-brand-700 text-white',
        sand: 'bg-sand-200 text-ink-900',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
