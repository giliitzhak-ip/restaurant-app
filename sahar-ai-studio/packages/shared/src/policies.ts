/**
 * Versioned legal/consent statements. When the wording changes, bump the version so
 * previously recorded acceptances remain attributable to the exact text accepted.
 */
export const TERMS_VERSION = '2026-10-19';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export type ConsentKind = 'MUSIC' | 'FACE_LIKENESS';

/**
 * Statements a user must accept for each upload. The exact text shown (in the UI
 * language) and its version are stored in ConsentRecord with the asset.
 */
export const CONSENT_STATEMENTS: Record<ConsentKind, { version: string; he: string; en: string }> =
  {
    MUSIC: {
      version: '2026-10-19',
      he: 'אני מאשר/ת שיש לי זכויות או רישיון להשתמש בשיר הזה, כולל ההקלטה והקול שבה, ליצירת קליפ.',
      en: 'I confirm that I own or have a licence to use this song, including its recording and the voice in it, to create a music video.',
    },
    FACE_LIKENESS: {
      version: '2026-10-19',
      he: 'אני מאשר/ת שהתמונה מאושרת לשימוש: היא שלי, או שיש לי הסכמה מפורשת של האדם המופיע בה להשתמש במראהו ליצירת וידאו בבינה מלאכותית.',
      en: 'I confirm this image is approved for use: it is of me, or I have the explicit consent of the person shown to use their likeness to create AI video.',
    },
  };

/** Per-user upload throttle (uploads per hour). */
export const UPLOADS_PER_HOUR = 60;
