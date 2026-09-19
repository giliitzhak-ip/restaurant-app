/**
 * Boot-time checks.
 *
 * Next calls `register()` once per server process before it handles a request,
 * which is the right moment to refuse a broken production environment: the
 * deploy fails immediately and visibly, instead of the first customer meeting
 * a 500 — or worse, an order landing in a store that loses it on restart.
 */
export async function register() {
  const { assertProductionEnv, collectEnvProblems, isProduction } = await import("@/config/env");

  if (!isProduction) {
    // Development gets a nudge, not a crash.
    const problems = collectEnvProblems();
    if (problems.length) {
      console.info(`[env] ${problems.length} production requirement(s) unset — fine locally.`);
    }
    return;
  }

  assertProductionEnv();
}
