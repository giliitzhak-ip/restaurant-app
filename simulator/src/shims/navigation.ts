/** `next/navigation` stand-in. The simulator holds its own state; nothing routes. */
export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function usePathname() {
  return '/';
}

export function redirect(): never {
  throw new Error('redirect() is not available in the simulator');
}

export function notFound(): never {
  throw new Error('notFound() is not available in the simulator');
}
