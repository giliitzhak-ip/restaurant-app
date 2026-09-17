/**
 * Server startup.
 *
 * Next calls `register` once per server process, before any request is
 * served, which is the only place this application can own a clock. See
 * @/domains/maintenance/scheduler for why it needs one.
 */
export async function register(): Promise<void> {
  // Only in the Node.js runtime: the edge runtime has no timers worth the
  // name and no database connection.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /*
   * Fail at boot rather than in the dark.
   *
   * A notifier that reaches nobody does not produce complaints — it produces
   * a marketplace that looks like it has no liquidity. Loud and immediate is
   * the only safe way to be wrong about this.
   */
  const { assertNotifierIsSafe } = await import('@/domains/notifications');
  assertNotifierIsSafe();

  const { startMaintenanceScheduler } = await import('@/domains/maintenance/scheduler');
  startMaintenanceScheduler();
}
