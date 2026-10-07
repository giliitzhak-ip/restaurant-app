/**
 * נתיבי זהות: הרשמת עסק, התחברות, ניהול עובדים וקונסולת מנהל המערכת.
 */

import crypto from 'node:crypto';
import {
  ACCESS, hashPassword, hashToken, isValidEmail, loginLockState, newToken,
  nextLockState, normalizeEmail, organizationAccess, passwordProblems,
  sessionExpiry, verifyPassword,
} from './auth.js';

const ORG_STATUSES = new Set(['pending', 'approved', 'suspended', 'rejected']);
const ORG_ROLES = new Set(['owner', 'exterminator', 'field']);

export function createAuthRoutes(db) {
  const q = {
    userByEmail: db.prepare('SELECT * FROM app_users WHERE email_normalized = ?'),
    userById: db.prepare('SELECT * FROM app_users WHERE id = ?'),
    usersByOrg: db.prepare('SELECT * FROM app_users WHERE org_id = ? ORDER BY created_at'),
    orgById: db.prepare('SELECT * FROM organizations WHERE id = ?'),
    insertOrg: db.prepare(`INSERT INTO organizations
      (id, name, contact_name, phone, email, license_number, status, plan, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', 'trial', ?)`),
    insertUser: db.prepare(`INSERT INTO app_users
      (id, org_id, email, email_normalized, password_hash, password_salt, name, role,
       is_super_admin, status, license_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`),
    touchLogin: db.prepare('UPDATE app_users SET last_login_at = ? WHERE id = ?'),
    setUserStatus: db.prepare('UPDATE app_users SET status = ?, role = ? WHERE id = ? AND org_id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)'),
    sessionByHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    touchSession: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?'),
    attempts: db.prepare('SELECT * FROM login_attempts WHERE key = ?'),
    upsertAttempts: db.prepare(`INSERT INTO login_attempts (key, failures, locked_until) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until`),
    clearAttempts: db.prepare('DELETE FROM login_attempts WHERE key = ?'),
    listOrgs: db.prepare('SELECT * FROM organizations ORDER BY CASE status WHEN \'pending\' THEN 0 ELSE 1 END, created_at DESC'),
    updateOrg: db.prepare(`UPDATE organizations
      SET status = ?, plan = ?, paid_until = ?, notes = ?, decided_at = ?, decided_by = ? WHERE id = ?`),
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM app_users WHERE org_id = ?'),
    countDocs: db.prepare('SELECT COUNT(*) AS n FROM sync_documents WHERE org_id = ? AND entity = ?'),

    /* הזמנות וקביעת סיסמה */
    insertInvite: db.prepare(`INSERT INTO invites
      (token_hash, user_id, org_id, kind, created_by, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    inviteByHash: db.prepare('SELECT * FROM invites WHERE token_hash = ?'),
    useInvite: db.prepare('UPDATE invites SET used_at = ? WHERE token_hash = ?'),
    dropUserInvites: db.prepare('DELETE FROM invites WHERE user_id = ? AND used_at IS NULL'),
    setPassword: db.prepare(
      'UPDATE app_users SET password_hash = ?, password_salt = ?, status = ? WHERE id = ?',
    ),
  };

  const INVITE_DAYS = 7;

  /** יוצר אסימון חד-פעמי לקביעת סיסמה, ומחזיר אותו פעם אחת בלבד. */
  function issueInvite(targetUser, kind, createdBy) {
    q.dropUserInvites.run(targetUser.id);   // הזמנה חדשה מבטלת קודמות
    const token = newToken();
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + INVITE_DAYS);
    q.insertInvite.run(
      hashToken(token), targetUser.id, targetUser.org_id, kind,
      createdBy, now.toISOString(), expires.toISOString(),
    );
    return { token, expiresAt: expires.toISOString() };
  }

  /** המשתמש המחובר לפי כותרת Authorization, או null. */
  function currentUser(req) {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;

    const session = q.sessionByHash.get(hashToken(token));
    if (!session) return null;
    if (new Date(session.expires_at).getTime() < Date.now()) {
      q.deleteSession.run(session.token_hash);
      return null;
    }
    const user = q.userById.get(session.user_id);
    if (!user || user.status !== 'active') return null;

    q.touchSession.run(new Date().toISOString(), session.token_hash);
    const org = user.org_id ? q.orgById.get(user.org_id) : null;
    return { user, org, tokenHash: session.token_hash };
  }

  function publicUser(user) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isSuperAdmin: Boolean(user.is_super_admin),
      licenseNumber: user.license_number ?? '',
      orgId: user.org_id,
    };
  }

  function publicOrg(org) {
    if (!org) return null;
    return {
      id: org.id,
      name: org.name,
      contactName: org.contact_name,
      phone: org.phone,
      email: org.email,
      licenseNumber: org.license_number,
      status: org.status,
      plan: org.plan,
      paidUntil: org.paid_until,
      createdAt: org.created_at,
    };
  }

  /* ───────── הרשמת עסק חדש ───────── */

  function register(body) {
    const businessName = String(body.businessName ?? '').trim();
    const contactName = String(body.contactName ?? '').trim();
    const name = String(body.name ?? contactName).trim();
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? '');

    const errors = [];
    if (businessName.length < 2) errors.push('יש להזין שם עסק.');
    if (contactName.length < 2) errors.push('יש להזין שם איש קשר.');
    if (!isValidEmail(email)) errors.push('כתובת הדוא״ל אינה תקינה.');
    errors.push(...passwordProblems(password));
    if (errors.length) return { status: 422, body: { ok: false, errors } };

    if (q.userByEmail.get(email)) {
      // אותה הודעה בדיוק כמו בהצלחה, כדי לא לחשוף אילו כתובות רשומות
      return { status: 409, body: { ok: false, errors: ['לא ניתן להירשם עם כתובת דוא״ל זו.'] } };
    }

    const now = new Date().toISOString();
    const orgId = `org_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const { hash, salt } = hashPassword(password);

    db.exec('BEGIN');
    try {
      q.insertOrg.run(
        orgId, businessName, contactName,
        String(body.phone ?? '').trim(), email,
        String(body.licenseNumber ?? '').trim(), now,
      );
      q.insertUser.run(
        userId, orgId, String(body.email ?? '').trim(), email, hash, salt,
        name || contactName, 'owner', 0, String(body.licenseNumber ?? '').trim(), now,
      );
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    return {
      status: 201,
      body: {
        ok: true,
        status: 'pending',
        message: 'ההרשמה נקלטה וממתינה לאישור מנהל המערכת.',
      },
    };
  }

  /* ───────── התחברות ───────── */

  function login(body) {
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? '');
    const generic = { status: 401, body: { ok: false, errors: ['דוא״ל או סיסמה שגויים.'] } };

    const lock = loginLockState(q.attempts.get(email));
    if (lock.locked) {
      return {
        status: 429,
        body: { ok: false, errors: [`יותר מדי ניסיונות. יש לנסות שוב בעוד ${lock.minutes} דקות.`] },
      };
    }

    const user = q.userByEmail.get(email);
    const ok = user && user.status === 'active'
      && verifyPassword(password, user.password_salt, user.password_hash);

    if (!ok) {
      const current = q.attempts.get(email);
      const next = nextLockState(current?.failures ?? 0);
      q.upsertAttempts.run(email, next.failures, next.lockedUntil);
      return generic;
    }

    q.clearAttempts.run(email);
    const org = user.org_id ? q.orgById.get(user.org_id) : null;
    const access = user.is_super_admin
      ? { level: ACCESS.FULL, reason: '' }
      : organizationAccess(org);

    const token = newToken();
    const now = new Date().toISOString();
    q.purgeSessions.run(now);
    q.insertSession.run(hashToken(token), user.id, now, sessionExpiry(), now);
    q.touchLogin.run(now, user.id);

    return {
      status: 200,
      body: {
        ok: true,
        token,
        user: publicUser(user),
        organization: publicOrg(org),
        access,
      },
    };
  }

  /* ───────── ניהול עובדים בתוך עסק ───────── */

  /**
   * הזמנת עובד – בלי סיסמה בטקסט גלוי.
   *
   * נוצר משתמש מושבת ללא סיסמה שמישהו יודע, ואיתו אסימון חד-פעמי.
   * העובד קובע את הסיסמה שלו בעצמו, ובעל העסק אינו יודע אותה.
   */
  function inviteEmployee(session, body) {
    const { user } = session;
    if (user.role !== 'owner' || !user.org_id) {
      return { status: 403, body: { ok: false, errors: ['רק בעל העסק רשאי להזמין עובדים.'] } };
    }
    const access = organizationAccess(session.org);
    if (access.level !== ACCESS.FULL) {
      return { status: 403, body: { ok: false, errors: [access.reason] } };
    }

    const email = normalizeEmail(body.email);
    const name = String(body.name ?? '').trim();
    const role = String(body.role ?? 'exterminator');

    const errors = [];
    if (name.length < 2) errors.push('יש להזין שם עובד.');
    if (!isValidEmail(email)) errors.push('כתובת הדוא״ל אינה תקינה.');
    if (!ORG_ROLES.has(role) || role === 'owner') errors.push('תפקיד לא חוקי.');
    if (errors.length) return { status: 422, body: { ok: false, errors } };

    if (q.userByEmail.get(email)) {
      return { status: 409, body: { ok: false, errors: ['לא ניתן להוסיף משתמש עם כתובת דוא״ל זו.'] } };
    }

    /* סיסמה אקראית שאינה מוחזרת לאיש: היא קיימת רק כדי שלא תהיה
       רשומה ללא גיבוב, ואין דרך להתחבר איתה. */
    const { hash, salt } = hashPassword(newToken());
    const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    q.insertUser.run(
      id, user.org_id, String(body.email ?? '').trim(), email, hash, salt, name, role, 0,
      String(body.licenseNumber ?? '').trim(), new Date().toISOString(),
    );
    q.setUserStatus.run('disabled', role, id, user.org_id);   // מושבת עד קביעת סיסמה

    const invite = issueInvite(q.userById.get(id), 'invite', user.id);
    return {
      status: 201,
      body: {
        ok: true,
        user: publicUser(q.userById.get(id)),
        token: invite.token,
        path: `#/invite/${invite.token}`,
        expiresAt: invite.expiresAt,
      },
    };
  }

  /**
   * איפוס סיסמה לעובד. בעל העסק מייצר קישור חד-פעמי ומעביר אותו
   * לעובד; הוא אינו רואה ואינו קובע את הסיסמה החדשה.
   */
  function resetEmployeePassword(session, targetId) {
    const { user } = session;
    if (user.role !== 'owner' || !user.org_id) {
      return { status: 403, body: { ok: false, errors: ['רק בעל העסק רשאי לאפס סיסמה.'] } };
    }
    const target = q.userById.get(targetId);
    if (!target || target.org_id !== user.org_id) {
      return { status: 404, body: { ok: false, errors: ['העובד לא נמצא.'] } };
    }
    if (target.id === user.id) {
      return {
        status: 422,
        body: { ok: false, errors: ['לאיפוס הסיסמה שלך יש לפנות למנהל המערכת.'] },
      };
    }
    /* כל הסשנים של העובד נסגרים: אם מישהו יודע את הסיסמה הקודמת,
       הגישה שלו נפסקת מיד ולא רק אחרי שהעובד יקבע סיסמה חדשה. */
    q.deleteUserSessions.run(target.id);
    const invite = issueInvite(target, 'reset', user.id);
    return {
      status: 200,
      body: {
        ok: true,
        path: `#/invite/${invite.token}`,
        token: invite.token,
        expiresAt: invite.expiresAt,
      },
    };
  }

  /** GET – פרטי הזמנה, בלי התחברות. תשובה אחידה לכל כשל. */
  function readInvite(token) {
    const notFound = {
      status: 404,
      body: { ok: false, errors: ['הקישור אינו פעיל. ייתכן שפג תוקפו או שכבר נעשה בו שימוש.'] },
    };
    const row = q.inviteByHash.get(hashToken(String(token ?? '')));
    if (!row || row.used_at) return notFound;
    if (new Date(row.expires_at).getTime() < Date.now()) return notFound;
    const target = q.userById.get(row.user_id);
    if (!target) return notFound;
    const org = target.org_id ? q.orgById.get(target.org_id) : null;
    return {
      status: 200,
      body: {
        ok: true,
        kind: row.kind,
        name: target.name,
        email: target.email,
        organizationName: org?.name ?? '',
      },
    };
  }

  /** POST – קביעת הסיסמה על ידי העובד עצמו, והתחברות מיד אחריה. */
  function acceptInvite(token, body) {
    const read = readInvite(token);
    if (read.status !== 200) return read;

    const password = String(body.password ?? '');
    const problems = passwordProblems(password);
    if (problems.length) return { status: 422, body: { ok: false, errors: problems } };

    const row = q.inviteByHash.get(hashToken(String(token ?? '')));
    const target = q.userById.get(row.user_id);
    const { hash, salt } = hashPassword(password);
    q.setPassword.run(hash, salt, 'active', target.id);
    q.useInvite.run(new Date().toISOString(), row.token_hash);
    q.clearAttempts.run(target.email_normalized);

    return login({ email: target.email_normalized, password });
  }

  function listEmployees(session) {
    const { user } = session;
    if (!user.org_id) return { status: 403, body: { ok: false, errors: ['אין עסק משויך.'] } };
    return {
      status: 200,
      body: { ok: true, users: q.usersByOrg.all(user.org_id).map(publicUser) },
    };
  }

  function updateEmployee(session, targetId, body) {
    const { user } = session;
    if (user.role !== 'owner' || !user.org_id) {
      return { status: 403, body: { ok: false, errors: ['רק בעל העסק רשאי לעדכן עובדים.'] } };
    }
    if (targetId === user.id) {
      return { status: 422, body: { ok: false, errors: ['לא ניתן לשנות את ההרשאות של עצמך.'] } };
    }
    const target = q.userById.get(targetId);
    if (!target || target.org_id !== user.org_id) {
      return { status: 404, body: { ok: false, errors: ['העובד לא נמצא.'] } };
    }
    const status = body.status === 'disabled' ? 'disabled' : 'active';
    const role = ORG_ROLES.has(body.role) && body.role !== 'owner' ? body.role : target.role;
    q.setUserStatus.run(status, role, targetId, user.org_id);
    if (status === 'disabled') q.deleteUserSessions.run(targetId);  // ניתוק מיידי
    return { status: 200, body: { ok: true, user: publicUser(q.userById.get(targetId)) } };
  }

  /* ───────── קונסולת מנהל המערכת ───────── */

  function listOrganizations(session) {
    if (!session.user.is_super_admin) {
      return { status: 403, body: { ok: false, errors: ['נדרשת הרשאת מנהל מערכת.'] } };
    }
    const rows = q.listOrgs.all().map((org) => ({
      ...publicOrg(org),
      notes: org.notes ?? '',
      decidedAt: org.decided_at,
      access: organizationAccess(org).level,
      // מטא-דאטה בלבד. תוכן הנתונים של העסק אינו נחשף למנהל המערכת.
      counts: {
        users: q.countUsers.get(org.id)?.n ?? 0,
        journals: q.countDocs.get(org.id, 'journals')?.n ?? 0,
        customers: q.countDocs.get(org.id, 'customers')?.n ?? 0,
      },
    }));
    return { status: 200, body: { ok: true, organizations: rows } };
  }

  function decideOrganization(session, orgId, body) {
    if (!session.user.is_super_admin) {
      return { status: 403, body: { ok: false, errors: ['נדרשת הרשאת מנהל מערכת.'] } };
    }
    const org = q.orgById.get(orgId);
    if (!org) return { status: 404, body: { ok: false, errors: ['העסק לא נמצא.'] } };

    const status = ORG_STATUSES.has(body.status) ? body.status : org.status;
    const plan = String(body.plan ?? org.plan ?? 'trial');
    const paidUntil = body.paidUntil === null || body.paidUntil === ''
      ? null
      : String(body.paidUntil ?? org.paid_until ?? '') || null;

    if (paidUntil && !/^\d{4}-\d{2}-\d{2}$/.test(paidUntil)) {
      return { status: 422, body: { ok: false, errors: ['תאריך תשלום חייב להיות בפורמט YYYY-MM-DD.'] } };
    }

    const notes = body.notes === undefined ? (org.notes ?? '') : String(body.notes);
    q.updateOrg.run(status, plan, paidUntil, notes, new Date().toISOString(), session.user.id, orgId);

    // השעיה או דחייה מנתקת מיד את כל המשתמשים של אותו עסק
    if (status === 'suspended' || status === 'rejected') {
      for (const u of q.usersByOrg.all(orgId)) q.deleteUserSessions.run(u.id);
    }

    const updated = q.orgById.get(orgId);
    return {
      status: 200,
      body: { ok: true, organization: { ...publicOrg(updated), notes: updated.notes ?? '' } },
    };
  }

  function me(session) {
    const access = session.user.is_super_admin
      ? { level: ACCESS.FULL, reason: '' }
      : organizationAccess(session.org);
    return {
      status: 200,
      body: {
        ok: true,
        user: publicUser(session.user),
        organization: publicOrg(session.org),
        access,
      },
    };
  }

  function logout(session) {
    q.deleteSession.run(session.tokenHash);
    return { status: 200, body: { ok: true } };
  }

  return {
    currentUser, register, login, logout, me,
    inviteEmployee, resetEmployeePassword, readInvite, acceptInvite,
    listEmployees, updateEmployee,
    listOrganizations, decideOrganization,
    publicUser, publicOrg,
  };
}
