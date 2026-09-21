/**
 * מודל הנתונים של "יומן הדברה – יצחק הדברות".
 * הטיפוסים כאן הם מקור האמת היחיד: אותם שדות בדיוק נשמרים ב-IndexedDB בצד הלקוח
 * וב-SQLite בצד השרת (server/schema.sql).
 */

export type ID = string;

/* ───────────────── משתמשים והרשאות ───────────────── */

export type Role = 'admin' | 'exterminator' | 'field';

export interface User {
  id: ID;
  name: string;
  role: Role;
  phone?: string;
  email?: string;
}

export interface Exterminator {
  id: ID;
  userId: ID;
  name: string;
  licenseNumber: string;
  licenseExpiry?: string;
  phone?: string;
}

/* ───────────────── לקוחות ואתרים ───────────────── */

export type SiteKind =
  | 'apartment' | 'private_house' | 'office' | 'restaurant' | 'food_factory'
  | 'warehouse' | 'school' | 'clinic' | 'public_area' | 'other';

export interface Customer {
  id: ID;
  customerNumber: string;
  name: string;
  contactName?: string;
  phone?: string;
  phoneAlt?: string;
  email?: string;
  address: string;
  city?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

export interface CustomerSite {
  id: ID;
  customerId: ID;
  label: string;
  address: string;
  siteKind: SiteKind;
  accessNotes?: string;
  keyNotes?: string;
  gateNotes?: string;
  parkingNotes?: string;
  onSiteContact?: string;
}

/* ───────────────── חומרים ותוויות ───────────────── */

/**
 * verificationStatus:
 *  'verified'   – הנתונים הועתקו מתווית רשמית שאומתה, עם תאריך אימות ומקור.
 *  'unverified' – החומר קיים במאגר אך נתוני התווית טרם הוזנו/אומתו מול המקור הרשמי.
 * לעולם אין להציג 'verified' ללא מקור רשמי מאומת.
 */
export type VerificationStatus = 'verified' | 'unverified';

/** ערך שטרם הוזן מהתווית הרשמית. אין להמציא ערך במקומו. */
export const NOT_ENTERED = 'לא הוזן' as const;

export interface MaterialDose {
  id: ID;
  /** למשל: "תיקנים – משטח סופג" */
  label: string;
  pestIds?: string[];
  /** תנאי שמפעיל את המינון (למשל surfaceType=absorbent) */
  condition?: { field: string; value: string };
  /** טווח/ערך מינון כפי שמופיע בתווית. NOT_ENTERED כל עוד לא הוזן מהמקור. */
  amount: string;
  unit?: string;
  notes?: string;
}

export interface MaterialLabel {
  id: ID;
  materialId: ID;
  /** קישור לתווית הרשמית */
  sourceUrl?: string;
  registrationValidUntil?: string;
  approvedPestIds: string[];
  doses: MaterialDose[];
  humanWarnings: string[];
  animalWarnings: string[];
  environmentRisks: string[];
  customerInstructions: string[];
  /** זמן כניסה מחדש בשעות. null = לא רלוונטי (למשל פיתיון בתיבה), undefined = לא הוזן. */
  reEntryHours?: number | null;
  reEntryNote?: string;
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  verifiedBy?: string;
}

export type MaterialForm = 'spray' | 'bait_paste' | 'bait_block' | 'dust' | 'gel' | 'other';

export interface Material {
  id: ID;
  tradeName: string;
  /** תוארית – תצורת התכשיר כפי שמופיעה בתווית */
  formulation: string;
  form: MaterialForm;
  activeIngredients: { name: string; concentration: string }[];
  registrationNumber: string;
  aliases: string[];
  labelId?: ID;
  archived?: boolean;
}

/* ───────────────── מזיקים ───────────────── */

export interface Pest {
  id: string;
  name: string;
  aliases: string[];
  group: 'crawling' | 'flying' | 'rodent' | 'other';
}

/* ───────────────── יומן ───────────────── */

export type JournalStatus = 'draft' | 'completed' | 'sent' | 'needs_completion' | 'cancelled';
export type WorkKind = 'private' | 'business' | 'institutional' | 'municipal' | 'other';
export type VisitKind = 'new' | 'inspection' | 'followup' | 'warranty';
export type Severity = 'low' | 'medium' | 'high';

export interface JournalPest {
  id: ID;
  journalId: ID;
  pestId: string;
  severity: Severity;
  areas: string[];
  signs: string[];
  suspectedSource?: string;
}

export type ActionKind =
  | 'monitoring' | 'sealing' | 'cleaning' | 'vacuum' | 'traps'
  | 'bait_stations' | 'spot_treatment' | 'spraying';

export interface JournalAction {
  id: ID;
  journalId: ID;
  kind: ActionKind;
  areas: string[];
  equipment: string[];
  notes?: string;
}

/** נתוני ביצוע – נמדדים בכל יומן מחדש ולעולם אינם נשמרים בתבנית. */
export interface JournalMaterialExecution {
  batchNumber: string;
  packageExpiry: string;
  chosenDoseId?: ID;
  chosenDoseText: string;
  materialAmount: string;
  waterAmount: string;
  coverage: string;
  coverageUnit: 'sqm' | 'stations' | 'units';
}

export interface JournalMaterial {
  id: ID;
  journalId: ID;
  materialId: ID;
  /** צילום שם מסחרי בעת השימוש – לתיעוד היסטורי, לא כמפתח */
  materialNameSnapshot: string;
  templateId?: ID;
  /** תשובות לשדות מותנים של התבנית (למשל bedFrameSprayed=yes, surfaceType=absorbent) */
  conditionAnswers: Record<string, string>;
  execution: JournalMaterialExecution;
  /** אישור ידני כשמידע התווית טרם אומת או שהתוקף ישן */
  acknowledgedUnverified?: boolean;
  acknowledgedAt?: string;
}

export interface BaitStationRecord {
  id: ID;
  journalId: ID;
  customerId: ID;
  stationCode: string;
  location: string;
  quantity: string;
  secured: boolean;
  nextCheckDate?: string;
  notes?: string;
}

export interface Signature {
  id: ID;
  journalId: ID;
  role: 'exterminator' | 'customer';
  signerName: string;
  /** dataURL של החתימה */
  image: string;
  signedAt: string;
}

export interface Attachment {
  id: ID;
  journalId: ID;
  kind: 'photo' | 'document';
  name: string;
  dataUrl: string;
  createdAt: string;
}

export type WarrantyKind = 'none' | 'days' | 'months' | 'custom';

export interface Journal {
  id: ID;
  journalNumber: number;
  status: JournalStatus;

  /* שלב 1 */
  startedAt: string;
  workKind: WorkKind;
  visitKind: VisitKind;
  exterminatorId: ID;
  exterminatorName: string;
  licenseNumber: string;
  assistantName?: string;

  /* שלב 2 */
  customerId?: ID;
  siteId?: ID;
  siteKind?: SiteKind;
  siteAddress?: string;
  siteAccessNotes?: string;

  /* שלב 3 */
  findingsNotes?: string;

  /* שלב 4 */
  preTreatmentActions: string[];

  /* שלב 6 */
  exterminatorNote?: string;

  /* שלב 7 */
  preventionRecommendations: string[];
  warrantyKind: WarrantyKind;
  warrantyValue?: string;
  nextInspectionDate?: string;
  summary?: string;

  /* שלב 8 */
  customerAcknowledged: boolean;
  completedAt?: string;

  createdAt: string;
  updatedAt: string;
  /** השלב האחרון שבו היה המשתמש – לשחזור אשף */
  lastStep: number;
  cancelledReason?: string;
}

/** יומן מלא עם כל הישויות התלויות – מבנה העבודה באפליקציה. */
export interface FullJournal {
  journal: Journal;
  pests: JournalPest[];
  actions: JournalAction[];
  materials: JournalMaterial[];
  baitStations: BaitStationRecord[];
  signatures: Signature[];
  attachments: Attachment[];
}

/* ───────────────── תבניות ───────────────── */

export interface TemplateConditionField {
  key: string;
  question: string;
  options: { value: string; label: string }[];
  required: boolean;
  /** הנחיות שיוצגו רק כשנבחר ערך מסוים */
  revealInstructions?: Record<string, string[]>;
}

export interface TreatmentTemplate {
  id: ID;
  name: string;
  materialId: ID;
  pestIds: string[];
  defaultActions: ActionKind[];
  conditionFields: TemplateConditionField[];
  /** מינונים רלוונטיים מתוך התווית (מזהים בלבד – מקור האמת נשאר בתווית) */
  doseIds: ID[];
  /** טיפול בתיבות האכלה דורש שדות תיבה */
  requiresBaitStations?: boolean;
  system: boolean;
  archived?: boolean;
  notes?: string;
}

/** תבנית לקוח – פרטים קבועים בלבד. אסור שתכיל נתוני ביצוע. */
export interface CustomerTemplate {
  id: ID;
  name: string;
  customerId: ID;
  siteId?: ID;
  siteKind?: SiteKind;
  fixedAreas: string[];
  baitStationLocations: string[];
  commonPestIds: string[];
  preferredMaterialId?: ID;
  accessInstructions?: string;
  frequencyDays?: number;
  archived?: boolean;
  createdAt: string;
}

/* ───────────────── מסלול ומשימות ───────────────── */

export type StopStatus = 'pending' | 'on_the_way' | 'in_progress' | 'done' | 'postponed';

export interface Route {
  id: ID;
  date: string;
  name: string;
  exterminatorId: ID;
  createdAt: string;
}

export interface RouteStop {
  id: ID;
  routeId: ID;
  customerId: ID;
  siteId?: ID;
  position: number;
  plannedTime?: string;
  estimatedMinutes?: number;
  status: StopStatus;
  focusNote?: string;
  journalId?: ID;
}

export type TaskKind = 'inspection' | 'retreatment' | 'bait_check' | 'billing' | 'document';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  id: ID;
  kind: TaskKind;
  title: string;
  customerId?: ID;
  journalId?: ID;
  dueDate: string;
  priority: TaskPriority;
  done: boolean;
  remind: boolean;
  createdAt: string;
}

/* ───────────────── ביקורת ותיעוד ───────────────── */

export interface AuditEntry {
  id: ID;
  entity: string;
  entityId: ID;
  action: 'create' | 'update' | 'complete' | 'cancel' | 'archive' | 'send';
  field?: string;
  before?: string;
  after?: string;
  userId: ID;
  userName: string;
  at: string;
}

/* ───────────────── תור סנכרון ───────────────── */

export interface SyncOp {
  id: ID;
  entity: string;
  entityId: ID;
  payload: unknown;
  at: string;
  tries: number;
}

export interface AppState {
  users: User[];
  exterminators: Exterminator[];
  customers: Customer[];
  sites: CustomerSite[];
  journals: Journal[];
  journalPests: JournalPest[];
  journalActions: JournalAction[];
  journalMaterials: JournalMaterial[];
  materials: Material[];
  materialLabels: MaterialLabel[];
  treatmentTemplates: TreatmentTemplate[];
  customerTemplates: CustomerTemplate[];
  routes: Route[];
  routeStops: RouteStop[];
  tasks: Task[];
  baitStations: BaitStationRecord[];
  attachments: Attachment[];
  signatures: Signature[];
  auditLog: AuditEntry[];
  currentUserId: ID;
  counters: { journalNumber: number; customerNumber: number };
}
