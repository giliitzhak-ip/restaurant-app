import type { FullJournal, Journal, JournalAction } from '../src/types';

export interface Issue {
  field: string;
  message: string;
  step: number;
  blocking: boolean;
}

export const REQUIRED_FIELDS: Record<string, string[]>;
export const EXECUTION_FIELDS: string[];
export const JOURNAL_STATUSES: string[];

export function isPositiveNumber(value: unknown): boolean;
export function isValidDate(value: unknown): boolean;
export function isPastDate(value: unknown, now?: Date): boolean;
export function isTreatmentWithoutProduct(
  journal: Pick<Journal, 'noProductUsed'> | undefined,
  actions: JournalAction[] | undefined,
): boolean;
export function journalIssues(full: FullJournal, now?: Date): Issue[];
export function blockingOnly(issues: Issue[]): Issue[];
export function payloadErrors(entity: string, payload: unknown): string[];
export function deletionRefusal(entity: string, current: unknown): string | null;
