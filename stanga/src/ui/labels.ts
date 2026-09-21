/** Hebrew UI strings. Code stays English; everything the player reads lives here. */
import { GameConfig, type ScoreKind, type ShotStyle } from '../config/GameConfig';
import { describeShot, elevationFor, styleProfile } from '../game/ShotResolver';
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
  ground: 'בעיטה שטוחה',
  driven: 'בעיטה חזקה',
  lofted: 'בעיטה מוגבהת',
  chip: 'הרמה קצרה',
  curled: 'בעיטה מסובבת',
  volley: 'וולה',
  pass: 'מסירה',
};

/** The name of the shape the player has *selected*, for the HUD and the pad. */
export const SHOT_STYLE_LABELS: Record<ShotStyle, string> = {
  flat: 'שטוחה',
  normal: 'רגילה',
  lofted: 'מוגבהת',
  curled: 'מסובבת',
  chip: 'צ׳יפ',
};

/** Which goal a team attacks, in words, for the lobby. */
/**
 * How a team is named on screen. The simulation calls them home and away —
 * those names are baked into the rules, the goals and the wire format — but a
 * player reads colours, so 2×2 shows them as orange and blue.
 */
export const TEAM_LABELS: Record<TeamId, string> = {
  home: 'הכתומים',
  away: 'הכחולים',
};

export function teamLabel(team: TeamId): string {
  return TEAM_LABELS[team];
}

/**
 * What a player's next strike would be, judged from where they are aiming.
 * The real answer comes from the server after the fact; this is the HUD's
 * preview, and it uses the same thresholds.
 */
export function aimedShotType(player: {
  verticalAim: number;
  chipRequested: boolean;
  shotStyle: ShotStyle;
  spin: number;
  kickCharge: number;
  /** Where the ball is right now: above the volley height, this is a volley. */
  ballHeight: number;
}): ShotType {
  const style = player.chipRequested ? 'chip' : player.shotStyle;
  return describeShot(
    style,
    elevationFor(style, player.verticalAim),
    player.kickCharge,
    player.spin * GameConfig.kick.maxSpinRate * styleProfile(style).spinScale,
    player.ballHeight >= GameConfig.kick.volleyHeight,
  );
}

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
  violation: 'נגיעה כפולה',
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

/** Why a connection attempt was refused, in the words the player reads. */
export const CONNECT_ERROR_LABELS: Record<string, string> = {
  protocolMismatch: 'הגרסה שלכם ישנה. רעננו את הדף כדי לשחק אונליין.',
  roomNotFound: 'לא נמצא חדר עם הקוד הזה. בדקו את הקוד ונסו שוב.',
  roomFull: 'החדר כבר מלא.',
  matchInProgress: 'המשחק בחדר כבר התחיל.',
  rateLimited: 'יותר מדי ניסיונות. המתינו רגע ונסו שוב.',
  invalidName: 'צריך שם כדי לשחק אונליין.',
  unreachable: 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.',
};

export function connectErrorLabel(reason: string): string {
  return CONNECT_ERROR_LABELS[reason] ?? CONNECT_ERROR_LABELS.unreachable ?? 'שגיאת חיבור.';
}

/** What the online room is waiting for right now. */
export const ROOM_STAGE_LABELS: Record<string, string> = {
  waiting: 'ממתינים ליריב…',
  lobby: 'היריב הגיע. לחצו "מוכן" כדי להתחיל.',
  countdown: 'מתחילים…',
  playing: 'המשחק רץ.',
  paused: 'היריב התנתק — ממתינים שיחזור.',
  finished: 'המשחק הסתיים.',
  closed: 'החדר נסגר.',
};

export function roomStageLabel(stage: string): string {
  return ROOM_STAGE_LABELS[stage] ?? '';
}
