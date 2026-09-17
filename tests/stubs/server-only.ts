/**
 * `server-only` throws when imported from a client bundle. Vitest runs these
 * modules in Node, where that guard is neither needed nor resolvable, so the
 * config aliases the package to this no-op.
 */
export {};
