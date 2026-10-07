/**
 * קישורי מסמך ללקוח.
 *
 * הקישור מאפשר ללקוח לראות את המסמך בלי חשבון, ולכן הוא מוגבל:
 * מצביע על צילום של יומן שהושלם בלבד (לא על טיוטה), נושא אסימון
 * אקראי שנשמר כגיבוב, יש לו תוקף, והוא ניתן לביטול.
 */

import { ACCESS, hashToken, newToken, organizationAccess } from './auth.js';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

export function createDocLinkRoutes(db) {
  const insertLink = db.prepare(`
    INSERT INTO doc_links
      (token_hash, journal_id, org_id, created_by, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const selectByToken = db.prepare('SELECT * FROM doc_links WHERE token_hash = ?');
  const selectByJournal = db.prepare(
    `SELECT token_hash, created_at, expires_at, revoked_at, views, last_viewed_at
     FROM doc_links WHERE journal_id = ? AND org_id = ? ORDER BY created_at DESC`,
  );
  const revokeByJournal = db.prepare(
    'UPDATE doc_links SET revoked_at = ? WHERE journal_id = ? AND org_id = ? AND revoked_at IS NULL',
  );
  const countView = db.prepare(
    'UPDATE doc_links SET views = views + 1, last_viewed_at = ? WHERE token_hash = ?',
  );
  const selectSnapshot = db.prepare(
    `SELECT payload FROM sync_documents
     WHERE entity = 'journal_snapshots' AND org_id = ? AND deleted_at IS NULL
       AND json_extract(payload, '$.journalId') = ?`,
  );
  const selectOrgName = db.prepare('SELECT name FROM organizations WHERE id = ?');

  /** POST /api/doc-links – יצירת קישור ליומן שהושלם. */
  function create(session, body) {
    if (!session.user.org_id) {
      return { status: 403, body: { ok: false, errors: ['למשתמש זה אין עסק משויך.'] } };
    }
    const access = organizationAccess(session.org);
    if (access.level !== ACCESS.FULL) {
      return { status: 403, body: { ok: false, errors: [access.reason], access: access.level } };
    }

    const journalId = String(body.journalId ?? '').trim();
    if (!journalId) {
      return { status: 400, body: { ok: false, errors: ['journalId חסר.'] } };
    }

    /* קישור נוצר רק למסמך סופי. טיוטה עדיין משתנה, ושליחתה ללקוח
       הייתה יוצרת מסמך שמשתנה אחרי שנמסר. */
    const snapshot = selectSnapshot.get(session.user.org_id, journalId);
    if (!snapshot) {
      return {
        status: 409,
        body: {
          ok: false,
          errors: ['אין מסמך סופי ליומן הזה. יש לסיים את היומן לפני שליחת קישור ללקוח.'],
        },
      };
    }

    const days = Math.min(Math.max(Number(body.days) || DEFAULT_DAYS, 1), MAX_DAYS);
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + days);

    const token = newToken();
    insertLink.run(
      hashToken(token), journalId, session.user.org_id, session.user.id,
      now.toISOString(), expires.toISOString(),
    );

    return {
      status: 201,
      body: {
        ok: true,
        token,
        path: `#/shared/${token}`,
        expiresAt: expires.toISOString(),
        days,
      },
    };
  }

  /** GET /api/doc-links?journalId= – מצב הקישורים ליומן. */
  function list(session, journalId) {
    if (!session.user.org_id) {
      return { status: 403, body: { ok: false, errors: ['למשתמש זה אין עסק משויך.'] } };
    }
    const rows = selectByJournal.all(String(journalId ?? ''), session.user.org_id);
    const now = Date.now();
    return {
      status: 200,
      body: {
        ok: true,
        links: rows.map((r) => ({
          createdAt: r.created_at,
          expiresAt: r.expires_at,
          revokedAt: r.revoked_at,
          views: r.views,
          lastViewedAt: r.last_viewed_at,
          active: !r.revoked_at && Date.parse(r.expires_at) > now,
        })),
      },
    };
  }

  /** POST /api/doc-links/revoke – ביטול כל הקישורים הפעילים ליומן. */
  function revoke(session, body) {
    if (!session.user.org_id) {
      return { status: 403, body: { ok: false, errors: ['למשתמש זה אין עסק משויך.'] } };
    }
    const journalId = String(body.journalId ?? '').trim();
    if (!journalId) {
      return { status: 400, body: { ok: false, errors: ['journalId חסר.'] } };
    }
    revokeByJournal.run(new Date().toISOString(), journalId, session.user.org_id);
    return { status: 200, body: { ok: true, revoked: true } };
  }

  /**
   * GET /api/doc/:token – המסמך עצמו, ללא התחברות.
   * תשובת 404 אחידה לכל כשל, כדי לא להסגיר אם אסימון קיים אך פג.
   */
  function read(token) {
    const notFound = {
      status: 404,
      body: { ok: false, errors: ['הקישור אינו פעיל. ייתכן שפג תוקפו או שבוטל.'] },
    };
    const raw = String(token ?? '');
    if (!raw) return notFound;

    const row = selectByToken.get(hashToken(raw));
    if (!row) return notFound;
    if (row.revoked_at) return notFound;
    if (Date.parse(row.expires_at) <= Date.now()) return notFound;

    const snapshot = selectSnapshot.get(row.org_id, row.journal_id);
    if (!snapshot) return notFound;

    countView.run(new Date().toISOString(), row.token_hash);
    const org = selectOrgName.get(row.org_id);

    return {
      status: 200,
      body: {
        ok: true,
        businessName: org?.name ?? '',
        expiresAt: row.expires_at,
        snapshot: JSON.parse(snapshot.payload),
      },
    };
  }

  return { create, list, revoke, read };
}
