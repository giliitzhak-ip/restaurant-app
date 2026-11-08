/**
 * `next/link` stand-in for the standalone simulator bundle.
 * The simulator has no router; links are inert by design.
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react';

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: ReactNode;
}

export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={href} onClick={(event) => event.preventDefault()} {...rest}>
      {children}
    </a>
  );
}
