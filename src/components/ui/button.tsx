import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[0.01em] transition-[background-color,color,border-color,transform,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] disabled:pointer-events-none disabled:opacity-45 active:translate-y-px [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-canvas hover:bg-ink-soft rounded-sm",
        brass:
          "bg-brass text-white hover:bg-[#7a5c3a] rounded-sm",
        outline:
          "border border-line-strong bg-transparent text-ink hover:border-ink hover:bg-surface rounded-sm",
        subtle:
          "bg-surface-2 text-ink hover:bg-surface-3 rounded-sm",
        ghost: "text-ink hover:bg-surface-2 rounded-sm",
        link: "text-ink underline-offset-4 hover:underline p-0 h-auto",
        danger: "bg-danger text-white hover:brightness-110 rounded-sm",
        studio:
          "bg-studio-ink text-studio hover:bg-white rounded-sm",
        studioOutline:
          "border border-studio-line text-studio-ink hover:border-studio-ink/60 hover:bg-white/5 rounded-sm",
      },
      size: {
        sm: "h-9 px-3.5 text-[0.8125rem] [&_svg]:size-4",
        md: "h-11 px-5 text-sm [&_svg]:size-4",
        lg: "h-13 px-7 text-[0.9375rem] [&_svg]:size-[18px]",
        icon: "size-10 rounded-sm [&_svg]:size-[18px]",
        iconSm: "size-8 rounded-sm [&_svg]:size-4",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
