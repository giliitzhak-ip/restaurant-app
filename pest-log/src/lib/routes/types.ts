import type { FocusCategory, FocusImportance, FocusSource, FocusStatus, RouteKind, RouteStatus, VisitPriority, VisitStatus } from '@/schema/routes';

/** שורות מסד הנתונים של מסלול העבודה, בצורת TypeScript. */

export interface RouteRow {
  id: string;
  organizationId: string;
  templateId: string | null;
  name: string;
  routeKind: RouteKind;
  areaName: string | null;
  routeDate: string;
  startTime: string | null;
  assignedUserId: string | null;
  teamName: string | null;
  vehicle: string | null;
  startPointAddress: string | null;
  startPointCoordinates: { latitude: number; longitude: number } | null;
  notes: string | null;
  status: RouteStatus;
  orderLocked: boolean;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface RouteVisitRow {
  id: string;
  organizationId: string;
  routeId: string;
  clientId: string;
  clientSiteId: string | null;
  position: number;
  plannedDate: string;
  plannedStartTime: string | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  estimatedDurationMinutes: number | null;
  serviceType: string | null;
  frequencyDays: number | null;
  priority: VisitPriority;
  status: VisitStatus;
  assignedUserId: string | null;
  assignedVehicleId: string | null;
  arrivalAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  linkedPestLogId: string | null;
  completionNotes: string | null;
  followUpRequired: boolean;
  postponedToDate: string | null;
  postponeReason: string | null;
  internalNotes: string | null;
  updatedAt: string;
}

export interface FocusItemRow {
  id: string;
  organizationId: string;
  visitId: string;
  category: FocusCategory;
  title: string;
  details: string | null;
  siteLocation: string | null;
  importance: FocusImportance;
  status: FocusStatus;
  source: FocusSource;
  sourceReference: Record<string, unknown>;
  approved: boolean;
  approvedAt: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  isInternal: boolean;
  attachmentId: string | null;
  position: number;
  updatedAt: string;
}

export interface TemplateStop {
  clientId: string;
  clientSiteId: string | null;
  position: number;
  serviceType?: string | null;
  frequencyDays?: number | null;
  estimatedDurationMinutes?: number | null;
  plannedStartTime?: string | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  priority?: VisitPriority;
  standingFocus?: Array<{ category?: FocusCategory; title: string; details?: string | null }>;
}

export interface RouteTemplateRow {
  id: string;
  organizationId: string;
  name: string;
  routeKind: RouteKind;
  areaName: string | null;
  weekday: number | null;
  defaultStartTime: string | null;
  defaultTeamName: string | null;
  defaultVehicle: string | null;
  defaultAssigneeId: string | null;
  startPointAddress: string | null;
  startPointCoordinates: { latitude: number; longitude: number } | null;
  stops: TemplateStop[];
  notes: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface VisitHistoryRow {
  id: string;
  visitId: string | null;
  routeId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromPosition: number | null;
  toPosition: number | null;
  reason: string | null;
  changedAt: string;
}

/** מסלול עם כל מה שצריך כדי לעבוד עליו, גם ללא קליטה. */
export interface RouteBundle {
  route: RouteRow;
  visits: RouteVisitRow[];
  focusByVisit: Record<string, FocusItemRow[]>;
}
