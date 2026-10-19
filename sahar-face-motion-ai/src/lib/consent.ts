// Consent statements shown to the user and stored verbatim on the ConsentRecord.
export const CONSENT_VERSION = "face-swap-v1";

export const CONSENT_TEXT = {
  faceSelf: "הפנים בתמונה הן הפנים שלי, ואני מסכים/ה להשתמש בהן להחלפת פנים בסרטון.",
  faceOther: "יש בידי הסכמה מפורשת מהאדם שבתמונה להשתמש בפניו להחלפת פנים בסרטון זה.",
  videoRights: "יש לי זכות להשתמש בסרטון, וכל מי שמופיע בו הסכים לעריכה מסוג זה.",
  label: "ידוע לי שהתוצאה היא תוכן סינתטי (AI). אסמן אותה ככזו ולא אציג אותה כהקלטה אמיתית.",
} as const;
