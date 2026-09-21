import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand-700 text-white shadow-soft hover:bg-brand-800 hover:shadow-lift active:translate-y-px',
        secondary: 'bg-ink-100 text-ink-900 hover:bg-ink-200',
        outline: 'border border-ink-200 bg-white text-ink-900 hover:border-brand-300 hover:bg-brand-50',
        ghost: 'text-ink-700 hover:bg-ink-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        sand: 'bg-sand-300 text-ink-900 hover:bg-sand-400',
      },
      size: {
        sm: 'h-9 rounded-lg px-3 text-sm',
        md: 'h-11 rounded-xl px-5 text-sm',
        lg: 'h-13 rounded-xl px-7 text-base',
        icon: 'size-10 rounded-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'

export { buttonVariants }
