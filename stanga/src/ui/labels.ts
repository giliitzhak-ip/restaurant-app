/** Hebrew UI strings. Code stays English; everything the player reads lives here. */
import type { ScoreKind } from '../config/GameConfig';
import type { MatchOutcome } from '../game/MatchState';

export const SCORE_KIND_LABELS: Record<ScoreKind, string> = {
  goal: 'שער!',
  post: 'קורה!',
  crossbar: 'משקוף!',
  junction: 'חיבור!',
};

export const OUTCOME_TITLES: Record<MatchOutcome, string> = {
  homeWin: 'ניצחון',
  awayWin: 'הפסד',
  draw: 'תיקו',
};

export const OUTCOME_DETAILS: Record<MatchOutcome, string> = {
  homeWin: 'סיימת את המשחק בראש. כל הכבוד.',
  awayWin: 'המחשב לקח את זה הפעם. נסה שוב.',
  draw: 'אף אחד לא ויתר — תיקו.',
};

export function pointsLabel(points: number): string {
  if (points === 1) return 'נקודה אחת';
  if (points === 2) return 'שתי נקודות';
  return `${points} נקודות`;
}

export const LOADING_STEPS: readonly string[] = [
  'מתחילים…',
  'טוען מנוע פיזיקה',
  'בונה את המגרש',
  'מציב את השערים',
  'מכין את השחקנים',
  'מוכן',
];
