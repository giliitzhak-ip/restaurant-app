/** Hebrew UI strings. Code stays English; everything the player reads lives here. */
import type { ScoreKind } from '../config/GameConfig';
import type { MatchOutcome, ShotType, TeamId } from '../game/MatchState';

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

export const SHOT_TYPE_LABELS: Record<ShotType, string> = {
  flat: 'בעיטה שטוחה',
  lob: 'בעיטה מוגבהת',
};

/** Which goal a team attacks, in words, for the lobby. */
export function attackingGoalLabel(team: TeamId): string {
  return team === 'home' ? 'תוקף את השער הצפוני' : 'תוקף את השער הדרומי';
}

export function pointsLabel(points: number): string {
  if (points === 1) return 'נקודה אחת';
  if (points === 2) return 'שתי נקודות';
  return `${points} נקודות`;
}

/** Written stand-in for an audio cue, for players who cannot rely on sound. */
export const AUDIO_CAPTIONS: Record<string, string> = {
  goal: '[שער]',
  post: '[פגיעה בקורה]',
  crossbar: '[פגיעה במשקוף]',
  junction: '[פגיעה בחיבור]',
  whistle: '[משרוקית]',
  tackle: '[חטיפה]',
  kick: '[בעיטה]',
};

export const LOADING_STEPS: readonly string[] = [
  'מתחילים…',
  'טוען מנוע פיזיקה',
  'בונה את המגרש',
  'מציב את השערים',
  'מכין את השחקנים',
  'מוכן',
];

/** Result title that names the winning player, for a two-human match. */
export function localOutcomeTitle(
  outcome: MatchOutcome,
  homeName: string,
  awayName: string,
): string {
  if (outcome === 'draw') return 'תיקו';
  return `${outcome === 'homeWin' ? homeName : awayName} מנצח`;
}
