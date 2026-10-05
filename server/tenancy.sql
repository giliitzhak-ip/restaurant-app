-- רב-עסקיות וזהות משתמשים.
-- כל עסק הוא דייר (tenant) נפרד; נתוני עסק אחד לעולם אינם נגישים לאחר.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                  -- שם העסק
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  license_number TEXT,                 -- מספר רישיון המדביר האחראי
  -- pending: נרשם וממתין לאישור | approved: מאושר | suspended: הושעה | rejected: נדחה
  status TEXT NOT NULL DEFAULT 'pending',
  plan TEXT NOT NULL DEFAULT 'trial',
  /* תאריך שעד אליו שולם. NULL = לא שולם / ניסיון.
     לאחר התאריך הגישה הופכת לקריאה בלבד, ונתונים לא נמחקים. */
  paid_until TEXT,
  notes TEXT,                          -- הערות פנימיות של מנהל המערכת
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES organizations(id),   -- NULL רק עבור מנהל המערכת
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  name TEXT NOT NULL,
  -- owner: בעל העסק | exterminator: מדביר | field: עובד שטח
  role TEXT NOT NULL DEFAULT 'owner',
  is_super_admin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',      -- active | disabled
  license_number TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,         -- נשמר גיבוב בלבד, לא האסימון עצמו
  user_id TEXT NOT NULL REFERENCES app_users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT
);

/* ניסיונות התחברות – בסיס להאטת ניחוש סיסמאות */
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,                -- דוא"ל מנורמל
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_org ON app_users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON app_users(email_normalized);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_orgs_status ON organizations(status);
