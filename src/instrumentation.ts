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

  const { startMaintenanceScheduler } = await import('@/domains/maintenance/scheduler');
  startMaintenanceScheduler();
}
