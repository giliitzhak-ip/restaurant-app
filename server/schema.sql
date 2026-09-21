-- סכימת מסד הנתונים של "יומן הדברה – יצחק הדברות"
-- SQLite (node:sqlite). המבנה תואם לטיפוסים שב-src/types/index.ts.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','exterminator','field')),
  phone TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS exterminators (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  license_number TEXT,
  license_expiry TEXT,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  customer_number TEXT NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  phone_alt TEXT,
  email TEXT,
  address TEXT NOT NULL,
  city TEXT,
  notes TEXT,
  archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customer_sites (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  site_kind TEXT NOT NULL,
  access_notes TEXT,
  key_notes TEXT,
  gate_notes TEXT,
  parking_notes TEXT,
  on_site_contact TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  trade_name TEXT NOT NULL,
  formulation TEXT,
  form TEXT,
  active_ingredients TEXT,      -- JSON
  registration_number TEXT,
  aliases TEXT,                 -- JSON
  archived INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS material_labels (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id),
  source_url TEXT,
  registration_valid_until TEXT,
  approved_pest_ids TEXT,       -- JSON
  doses TEXT,                   -- JSON
  human_warnings TEXT,          -- JSON
  animal_warnings TEXT,         -- JSON
  environment_risks TEXT,       -- JSON
  customer_instructions TEXT,   -- JSON
  re_entry_hours INTEGER,       -- NULL = לא חל / לא הוזן (ראו re_entry_note)
  re_entry_note TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  verified_at TEXT,
  verified_by TEXT
);

CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY,
  journal_number INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  work_kind TEXT,
  visit_kind TEXT,
  exterminator_id TEXT,
  exterminator_name TEXT,
  license_number TEXT,
  assistant_name TEXT,
  customer_id TEXT REFERENCES customers(id),
  site_id TEXT REFERENCES customer_sites(id),
  site_kind TEXT,
  site_address TEXT,
  site_access_notes TEXT,
  findings_notes TEXT,
  pre_treatment_actions TEXT,   -- JSON
  exterminator_note TEXT,
  prevention_recommendations TEXT, -- JSON
  warranty_kind TEXT,
  warranty_value TEXT,
  next_inspection_date TEXT,
  summary TEXT,
  customer_acknowledged INTEGER DEFAULT 0,
  completed_at TEXT,
  cancelled_reason TEXT,
  last_step INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS journal_pests (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES journals(id),
  pest_id TEXT NOT NULL,
  severity TEXT,
  areas TEXT,                   -- JSON
  signs TEXT,                   -- JSON
  suspected_source TEXT
);

CREATE TABLE IF NOT EXISTS journal_actions (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES journals(id),
  kind TEXT NOT NULL,
  areas TEXT,                   -- JSON
  equipment TEXT,               -- JSON
  notes TEXT
);

CREATE TABLE IF NOT EXISTS journal_materials (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES journals(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  material_name_snapshot TEXT NOT NULL,
  template_id TEXT,
  condition_answers TEXT,       -- JSON
  batch_number TEXT,
  package_expiry TEXT,
  chosen_dose_id TEXT,
  chosen_dose_text TEXT,
  material_amount TEXT,
  water_amount TEXT,
  coverage TEXT,
  coverage_unit TEXT,
  acknowledged_unverified INTEGER DEFAULT 0,
  acknowledged_at TEXT
);

CREATE TABLE IF NOT EXISTS treatment_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  material_id TEXT REFERENCES materials(id),
  pest_ids TEXT,                -- JSON
  default_actions TEXT,         -- JSON
  condition_fields TEXT,        -- JSON
  dose_ids TEXT,                -- JSON
  requires_bait_stations INTEGER DEFAULT 0,
  system INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS customer_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  site_id TEXT,
  site_kind TEXT,
  fixed_areas TEXT,             -- JSON
  bait_station_locations TEXT,  -- JSON
  common_pest_ids TEXT,         -- JSON
  preferred_material_id TEXT,
  access_instructions TEXT,
  frequency_days INTEGER,
  archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  name TEXT,
  exterminator_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS route_stops (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES routes(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  site_id TEXT,
  position INTEGER NOT NULL,
  planned_time TEXT,
  estimated_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  focus_note TEXT,
  journal_id TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  customer_id TEXT,
  journal_id TEXT,
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  done INTEGER DEFAULT 0,
  remind INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bait_stations (
  id TEXT PRIMARY KEY,
  journal_id TEXT REFERENCES journals(id),
  customer_id TEXT,
  station_code TEXT NOT NULL,
  location TEXT,
  quantity TEXT,
  secured INTEGER DEFAULT 0,
  next_check_date TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES journals(id),
  kind TEXT NOT NULL,
  name TEXT,
  data BLOB,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  journal_id TEXT NOT NULL REFERENCES journals(id),
  role TEXT NOT NULL,
  signer_name TEXT,
  image BLOB,
  signed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field TEXT,
  before TEXT,
  after TEXT,
  user_id TEXT,
  user_name TEXT,
  at TEXT NOT NULL
);

-- אינדקסים לחיפושים נפוצים
CREATE INDEX IF NOT EXISTS idx_journals_number ON journals(journal_number);
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(started_at);
CREATE INDEX IF NOT EXISTS idx_journals_customer ON journals(customer_id);
CREATE INDEX IF NOT EXISTS idx_journals_status ON journals(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_address ON customers(address);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_number ON customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_sites_customer ON customer_sites(customer_id);
CREATE INDEX IF NOT EXISTS idx_jmat_journal ON journal_materials(journal_id);
CREATE INDEX IF NOT EXISTS idx_jmat_material ON journal_materials(material_id);
CREATE INDEX IF NOT EXISTS idx_jpests_journal ON journal_pests(journal_id);
CREATE INDEX IF NOT EXISTS idx_jpests_pest ON journal_pests(pest_id);
CREATE INDEX IF NOT EXISTS idx_jactions_journal ON journal_actions(journal_id);
CREATE INDEX IF NOT EXISTS idx_materials_trade ON materials(trade_name);
CREATE INDEX IF NOT EXISTS idx_materials_reg ON materials(registration_number);
CREATE INDEX IF NOT EXISTS idx_stops_route ON route_stops(route_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_bait_customer ON bait_stations(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
