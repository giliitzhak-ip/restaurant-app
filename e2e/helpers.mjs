/** עזרי התחברות לבדיקות הדפדפן. */

export const ACCOUNTS = {
  admin: { email: 'admin@dev.local', password: 'DevAdmin123' },
  owner: { email: 'yizhak@dev.local', password: 'DevOwner123' },
  worker: { email: 'worker@dev.local', password: 'DevWorker123' },
};

/**
 * מתחבר דרך ה-API ומזריק את האסימון לאחסון המקומי,
 * כך שכל טעינת עמוד בהקשר הזה כבר מחוברת.
 */
export async function authenticate(context, base, account = ACCOUNTS.owner) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(account),
  });
  const body = await res.json();
  if (!res.ok || !body.token) {
    throw new Error(`התחברות נכשלה (${res.status}). יש להריץ: node server/tests/seed-dev.js`);
  }
  await context.addInitScript((token) => {
    try {
      localStorage.setItem('auth-token', token);
    } catch { /* אחסון חסום */ }
  }, body.token);
  return body;
}
