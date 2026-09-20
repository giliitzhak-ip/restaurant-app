/**
 * סיכום היומן להודעת טקסט — הועבר מהגרסה הקודמת.
 *
 * חשוב: הודעת SMS אינה יכולה לשאת קובץ. מה שנשלח הוא **סיכום טקסט**,
 * ואם יש קישור חתום ל-PDF הוא מצורף כקישור. המסך אומר זאת במפורש.
 */

export interface SmsSummaryInput {
  serialNumber: number | null;
  organizationName: string;
  snapshot: Record<string, unknown>;
  poisonCenterPhone: string;
  /** קישור חתום ל-PDF, אם הופק. */
  signedUrl?: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function locationLine(snapshot: Record<string, unknown>): string {
  const location = (snapshot.location ?? {}) as Record<string, unknown>;
  return [
    text(location.street) && `${text(location.street)} ${text(location.houseNumber)}`.trim(),
    text(location.apartmentNumber) && `דירה ${text(location.apartmentNumber)}`,
    text(location.neighborhoodName),
    text(location.city),
    text(location.localAuthorityName),
  ]
    .filter(Boolean)
    .join(', ');
}

export function buildSmsSummary(input: SmsSummaryInput): string {
  const { snapshot } = input;
  const orderer = (snapshot.orderer ?? {}) as Record<string, unknown>;
  const execution = (snapshot.execution ?? {}) as Record<string, unknown>;
  const monitoring = (snapshot.monitoring ?? {}) as Record<string, unknown>;
  const preWarnings = (snapshot.preWarnings ?? {}) as Record<string, unknown>;
  const postWarnings = (snapshot.postWarnings ?? {}) as Record<string, unknown>;
  const exterminator = (snapshot.exterminator ?? {}) as Record<string, unknown>;
  const applications = Array.isArray(snapshot.applications) ? snapshot.applications : [];

  const pests = (Array.isArray(monitoring.findings) ? monitoring.findings : [])
    .map((finding) => text((finding as Record<string, unknown>).pestName))
    .filter(Boolean);

  const products = applications
    .map((raw) => {
      const application = raw as Record<string, unknown>;
      const name = text(application.productTradeName);
      const active = text(application.activeIngredientName);
      return active ? `${name} (${active})` : name;
    })
    .filter(Boolean);

  const reEntry = preWarnings.reEntryHours;

  return [
    text(orderer.name) ? `שלום ${text(orderer.name)},` : 'שלום,',
    `יומן ביצוע הדברה מס׳ ${input.serialNumber ?? ''} – ${input.organizationName}`,
    `תאריך: ${text(execution.performedDate)} ${text(execution.performedStartTime)}`.trim(),
    locationLine(snapshot) ? `מקום: ${locationLine(snapshot)}` : '',
    pests.length > 0 ? `מזיקים: ${pests.join(', ')}` : '',
    products.length > 0 ? `תכשירים: ${products.join('; ')}` : '',
    typeof reEntry === 'number' ? `זמן כניסה מחדש: ${reEntry} שעות` : '',
    text(postWarnings.afterTreatmentInfo) ? `הנחיות: ${text(postWarnings.afterTreatmentInfo)}` : '',
    text(exterminator.fullName)
      ? `מדביר: ${text(exterminator.fullName)}, רישיון ${text(exterminator.licenseNumber)}, ${text(exterminator.mobile)}`
      : '',
    input.signedUrl ? `קישור ליומן המלא (תקף לזמן מוגבל): ${input.signedUrl}` : '',
    `במקרה של חשד להרעלה ניתן לפנות למרכז הארצי להרעלות: ${input.poisonCenterPhone}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** קישור פתיחה של אפליקציית ההודעות עם הסיכום. */
export function smsHref(phone: string | null | undefined, body: string, isApple = false): string {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  const separator = isApple ? '&' : '?';
  return `sms:${digits}${separator}body=${encodeURIComponent(body)}`;
}
