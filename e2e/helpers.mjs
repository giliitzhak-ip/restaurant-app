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

/**
 * יוצר עסק חדש ומאושר, ומחזיר את פרטי הכניסה שלו.
 *
 * לכל הרצת בדיקה עסק משלה, כי האפליקציה מסנכרנת נתונים מהשרת:
 * בלי זה הרצה אחת הייתה רואה את הנתונים של ההרצה שלפניה.
 * התהליך זהה לתהליך האמיתי – הרשמה ואחריה אישור של מנהל המערכת,
 * ואינו משתמש בשום נתיב מיוחד לבדיקות.
 */
export async function createFreshBusiness(base, label = 'עסק בדיקה') {
  const email = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}@dev.local`;
  const password = 'E2eBiz12345';
  const name = `${label} ${Date.now()}`;
  const contactName = 'בודק';

  const post = async (path, body, token) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  const registered = await post('/api/auth/register', {
    businessName: name, contactName, email, password,
  });
  if (registered.status !== 201) {
    throw new Error(`רישום עסק הבדיקה נכשל (${registered.status}): ${JSON.stringify(registered.body)}`);
  }

  const admin = await post('/api/auth/login', ACCOUNTS.admin);
  if (!admin.body.token) {
    throw new Error('מנהל המערכת לא התחבר. יש להריץ: node server/tests/seed-dev.js');
  }
  const listed = await fetch(`${base}/api/admin/organizations`, {
    headers: { Authorization: `Bearer ${admin.body.token}` },
  });
  const orgs = (await listed.json()).organizations ?? [];
  const org = orgs.find((o) => o.name === name);
  if (!org) throw new Error('העסק שנרשם לא נמצא ברשימת האישורים.');
  await post(`/api/admin/organizations/${org.id}`, {
    status: 'approved', plan: 'basic', paidUntil: '2099-12-31',
  }, admin.body.token);

  return { email, password, orgName: name, contactName };
}
