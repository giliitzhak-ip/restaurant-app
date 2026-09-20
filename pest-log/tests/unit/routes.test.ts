import { describe, expect, it } from 'vitest';
import {
  buildNavigationLinks,
  isAppleDevice,
  normalizeIsraeliMsisdn,
  telLink,
  whatsappLink,
} from '../../src/lib/routes/navigation';
import { autoOrderVisits, estimateSchedule, haversineKm, moveItem, type OrderableVisit } from '../../src/lib/routes/ordering';
import {
  formatDurationHe,
  isVisitLate,
  localDateIso,
  nextVisit,
  routeProgress,
  visitAlertLabel,
  visitTone,
} from '../../src/lib/routes/status';
import { suggestFocusItems } from '../../src/lib/routes/focus';
import { NEVER_PREFILLED_PATHS, buildLogPrefill, siteAddressText, siteCoordinates } from '../../src/lib/routes/prefill';
import type { RouteVisitRow } from '../../src/lib/routes/types';
import type { ClientRow, SiteRow } from '../../src/lib/repo';

/** נתוני בדיקה בדויים בלבד — אין כאן פרטי לקוח אמיתיים. */

function visit(overrides: Partial<RouteVisitRow> = {}): RouteVisitRow {
  return {
    id: 'v1',
    organizationId: 'org',
    routeId: 'r1',
    clientId: 'c1',
    clientSiteId: 's1',
    position: 1,
    plannedDate: '2026-09-20',
    plannedStartTime: '09:00',
    timeWindowStart: null,
    timeWindowEnd: null,
    estimatedDurationMinutes: 30,
    serviceType: null,
    frequencyDays: null,
    priority: 'normal',
    status: 'pending',
    assignedUserId: null,
    assignedVehicleId: null,
    arrivalAt: null,
    startedAt: null,
    completedAt: null,
    latitude: null,
    longitude: null,
    linkedPestLogId: null,
    completionNotes: null,
    followUpRequired: false,
    postponedToDate: null,
    postponeReason: null,
    internalNotes: null,
    updatedAt: '2026-09-20T06:00:00Z',
    ...overrides,
  };
}

function orderable(overrides: Partial<OrderableVisit> = {}): OrderableVisit {
  return {
    id: 'v1',
    position: 1,
    latitude: 31.78,
    longitude: 35.21,
    priority: 'normal',
    timeWindowStart: null,
    timeWindowEnd: null,
    estimatedDurationMinutes: 30,
    ...overrides,
  };
}

describe('קישורי ניווט, חיוג ו-WhatsApp', () => {
  it('בונה קישורים מנקודת ציון מדויקת', () => {
    const result = buildNavigationLinks({ latitude: 31.7683, longitude: 35.2137 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.links.precise).toBe(true);
    expect(result.links.waze).toContain('31.7683%2C35.2137');
    expect(result.links.googleMaps).toContain('destination=31.7683%2C35.2137');
    expect(result.links.appleMaps).toContain('daddr=31.7683,35.2137');
  });

  it('נופל לכתובת כשאין נקודת ציון', () => {
    const result = buildNavigationLinks({ address: 'רחוב הדוגמה 12, ירושלים' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.links.precise).toBe(false);
    expect(result.links.waze).toContain(encodeURIComponent('רחוב הדוגמה 12, ירושלים'));
  });

  it('מחזיר שגיאה ברורה במקום קישור שבור', () => {
    const result = buildNavigationLinks({ latitude: null, longitude: null, address: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('אין לתחנה כתובת');
  });

  it('דוחה נקודת ציון לא חוקית', () => {
    const result = buildNavigationLinks({ latitude: 999, longitude: 35, address: null });
    expect(result.ok).toBe(false);
  });

  it('מזהה מכשירי Apple לצורך הצגת Apple Maps', () => {
    expect(isAppleDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isAppleDevice('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });

  it('מנרמל מספרים ישראליים ומאפשר WhatsApp רק לנייד', () => {
    expect(normalizeIsraeliMsisdn('050-0000000')).toBe('972500000000');
    expect(normalizeIsraeliMsisdn('+972501234567')).toBe('972501234567');
    expect(whatsappLink('050-1234567')).toContain('https://wa.me/972501234567');
    // קו נייח — אין WhatsApp, ולכן הכפתור לא יוצג כלל.
    expect(whatsappLink('02-1234567')).toBeNull();
    expect(telLink('02-1234567')).toBe('tel:021234567');
    expect(telLink(null)).toBeNull();
  });
});

describe('סדר התחנות', () => {
  it('מעביר פריט במערך בלי לשנות את המקור', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(items).toEqual(['a', 'b', 'c']);
  });

  it('מחשב מרחק אווירי סביר', () => {
    const distance = haversineKm({ latitude: 31.78, longitude: 35.21 }, { latitude: 31.74, longitude: 35.19 });
    expect(distance).toBeGreaterThan(4);
    expect(distance).toBeLessThan(6);
  });

  it('מקדים לקוח דחוף שנמצא באמצע המסלול', () => {
    const result = autoOrderVisits(
      [
        orderable({ id: 'near', latitude: 31.781, longitude: 35.211 }),
        orderable({ id: 'urgent', latitude: 31.9, longitude: 35.4, priority: 'urgent' }),
        orderable({ id: 'far', latitude: 32.05, longitude: 34.78 }),
      ],
      { startPoint: { latitude: 31.78, longitude: 35.21 } },
    );
    expect(result.order[0]).toBe('urgent');
    expect(result.method).toBe('geographic');
    expect(result.explanation).toContain('ולא ניתוב אמיתי');
  });

  it('מקדים תחנה שחלון הזמן שלה נסגר מוקדם', () => {
    const result = autoOrderVisits([
      orderable({ id: 'late-window', latitude: 31.9, longitude: 35.4, timeWindowEnd: '18:00' }),
      orderable({ id: 'early-window', latitude: 32.0, longitude: 35.5, timeWindowEnd: '10:00' }),
    ]);
    expect(result.order[0]).toBe('early-window');
  });

  it('משאיר תחנות בלי נקודת ציון בסוף, בסדר הידני', () => {
    const result = autoOrderVisits([
      orderable({ id: 'no-coords-2', latitude: null, longitude: null, position: 5 }),
      orderable({ id: 'with-coords' }),
      orderable({ id: 'no-coords-1', latitude: null, longitude: null, position: 2 }),
    ]);
    expect(result.order).toEqual(['with-coords', 'no-coords-1', 'no-coords-2']);
    expect(result.withoutCoordinates).toEqual(['no-coords-1', 'no-coords-2']);
  });

  it('מעריך שעות הגעה ומכבד חלון זמן שנפתח מאוחר', () => {
    const estimate = estimateSchedule(
      [
        orderable({ id: 'first', latitude: 31.78, longitude: 35.21, estimatedDurationMinutes: 30 }),
        orderable({ id: 'second', latitude: 31.79, longitude: 35.22, timeWindowStart: '12:00' }),
      ],
      { startPoint: { latitude: 31.78, longitude: 35.21 }, startTime: '08:00' },
    );
    expect(estimate.entries[0]?.estimatedArrival).toBe('08:00');
    // התחנה השנייה אינה יכולה להתחיל לפני שהחלון נפתח.
    expect(estimate.entries[1]?.estimatedArrival).toBe('12:00');
    expect(estimate.totalDistanceKm).not.toBeNull();
  });

  it('מדווח כמה תחנות חסרות נקודת ציון, כדי שההערכה לא תוצג כמלאה', () => {
    const estimate = estimateSchedule([orderable({ id: 'x', latitude: null, longitude: null })]);
    expect(estimate.missingCoordinates).toBe(1);
    expect(estimate.totalDistanceKm).toBeNull();
  });
});

describe('סטטוס התחנות', () => {
  const now = new Date('2026-09-20T11:00:00');

  it('מזהה ביקור באיחור לפי שעה מתוכננת שעברה', () => {
    expect(isVisitLate(visit({ plannedStartTime: '09:00', plannedDate: localDateIso(now) }), now)).toBe(true);
    expect(isVisitLate(visit({ plannedStartTime: '15:00', plannedDate: localDateIso(now) }), now)).toBe(false);
  });

  it('ביקור של מחר אינו באיחור, וביקור שהושלם אף פעם לא', () => {
    expect(isVisitLate(visit({ plannedDate: '2026-09-21', plannedStartTime: '08:00' }), now)).toBe(false);
    expect(isVisitLate(visit({ plannedDate: '2026-09-19', status: 'completed' }), now)).toBe(false);
  });

  it('איחור ודחיפות צובעים באדום, אבל הטקסט נשאר של הסטטוס', () => {
    const late = visit({ plannedStartTime: '08:00', plannedDate: localDateIso(now) });
    expect(visitTone(late, now)).toBe('red');
    expect(visitAlertLabel(late, now)).toBe('באיחור');
    expect(visitAlertLabel(visit({ priority: 'urgent', plannedStartTime: '15:00' }), now)).toBe('דחוף');
    expect(visitTone(visit({ status: 'completed' }), now)).toBe('green');
    expect(visitTone(visit({ status: 'waiting_client', plannedStartTime: '15:00' }), now)).toBe('yellow');
  });

  it('מחשב התקדמות מסלול ומוצא את התחנה הבאה', () => {
    const visits = [
      visit({ id: 'a', position: 1, status: 'completed' }),
      visit({ id: 'b', position: 2, status: 'pending', priority: 'urgent', plannedStartTime: '15:00' }),
      visit({ id: 'c', position: 3, status: 'cancelled' }),
    ];
    const progress = routeProgress(visits, now);
    expect(progress.total).toBe(2);
    expect(progress.completed).toBe(1);
    expect(progress.remaining).toBe(1);
    expect(progress.urgent).toBe(1);
    expect(nextVisit(visits)?.id).toBe('b');
  });

  it('מציג משך בעברית', () => {
    expect(formatDurationHe(45)).toBe('45 דק׳');
    expect(formatDurationHe(120)).toBe('2 שע׳');
    expect(formatDurationHe(95)).toBe('1 שע׳ 35 דק׳');
  });
});

describe('הצעת דגשים', () => {
  it('לא ממציאה דבר כשאין נתונים', () => {
    expect(suggestFocusItems({})).toEqual([]);
  });

  it('גוזרת דגשים מהיומן האחרון, ממשימה פתוחה ומתחנת האכלה', () => {
    const suggestions = suggestFocusItems({
      lastLog: {
        id: 'log-1',
        serialNumber: 12,
        completedAt: '2026-08-01T10:00:00Z',
        snapshot: {
          monitoring: { findings: [{ pestName: 'מזיק דוגמה', findingLocation: 'מטבח', infestationLevel: 'high' }] },
          prevention: { actions: [{ description: 'איטום חריצים', status: 'not_done' }] },
          postWarnings: { followUpRequired: true, followUpDescription: 'ביקורת חוזרת' },
        },
      },
      openTasks: [{ logId: 'log-1', description: 'השלמת טיפול', targetDate: '2026-09-25' }],
      baitStations: [{ id: 'bs1', stationNumber: '01', locationDescription: 'מחסן', status: 'eaten' }],
      complaint: 'נראו מזיקים במחסן',
    });

    const titles = suggestions.map((item) => item.title);
    expect(titles).toContain('בדיקת מזיק דוגמה');
    expect(titles).toContain('מוקד לבדיקה: מטבח');
    expect(titles.some((title) => title.includes('איטום חריצים'))).toBe(true);
    expect(titles).toContain('משימת המשך פתוחה');
    expect(titles).toContain('תחנת האכלה 01');
    expect(titles).toContain('תלונת לקוח לבדיקה');
    // כל ההצעות נגזרות ממקור מזוהה.
    for (const suggestion of suggestions) {
      expect(Object.keys(suggestion.sourceReference).length).toBeGreaterThan(0);
    }
  });

  it('אינה מציעה פעולת מניעה שכבר בוצעה', () => {
    const suggestions = suggestFocusItems({
      lastLog: {
        id: 'log-2',
        serialNumber: 13,
        completedAt: null,
        snapshot: { prevention: { actions: [{ description: 'איטום', status: 'done' }] } },
      },
    });
    expect(suggestions).toEqual([]);
  });
});

describe('מילוי אוטומטי של יומן מביקור', () => {
  const client: ClientRow = {
    id: 'client-1',
    name: 'לקוח לבדיקה',
    isPrivatePerson: true,
    phone: '02-0000000',
    mobile: '050-0000000',
    email: null,
    contactRole: 'בעל הדירה',
    address: 'רחוב הבדיקה 1',
  };

  const site: SiteRow = {
    id: 'site-1',
    clientId: 'client-1',
    label: 'אתר בדיקה',
    placeKind: 'dwelling',
    city: 'ירושלים',
    street: 'רחוב הבדיקה',
    houseNumber: '1',
    apartmentNumber: '2',
    structureType: 'בניין מגורים',
    localAuthorityName: null,
    siteType: null,
    siteDescription: null,
    neighborhoodName: null,
    areaDescription: null,
    coordinates: { latitude: 31.78, longitude: 35.21 },
  };

  it('ממלא מזמין ומקום בלבד', () => {
    const updates = buildLogPrefill({ client, site, visitId: 'visit-1', routeId: 'route-1' });
    const paths = updates.map((update) => update.path);
    expect(paths).toContain('orderer.name');
    expect(paths).toContain('orderer.mobile');
    expect(paths).toContain('location.city');
    expect(paths).toContain('routeVisitId');

    for (const forbidden of NEVER_PREFILLED_PATHS) {
      expect(paths.some((path) => path === forbidden || path.startsWith(`${forbidden}.`))).toBe(false);
    }
  });

  it('אינו ממציא ערכים לשדות ריקים', () => {
    const updates = buildLogPrefill({ client: { ...client, mobile: null, contactRole: null }, site: null });
    const paths = updates.map((update) => update.path);
    expect(paths).not.toContain('orderer.mobile');
    expect(paths).not.toContain('orderer.role');
    expect(paths).not.toContain('location.siteId');
  });

  it('בונה כתובת מלאה ונקודת ציון מהאתר', () => {
    expect(siteAddressText(site)).toBe('רחוב הבדיקה 1 דירה 2 ירושלים');
    expect(siteCoordinates(site)).toEqual({ latitude: 31.78, longitude: 35.21 });
    expect(siteCoordinates({ ...site, coordinates: { latitude: 'x' } })).toBeNull();
    expect(siteAddressText(null, 'כתובת חלופית')).toBe('כתובת חלופית');
  });
});

describe('הפרדה בין מסלול העבודה ליומן הרשמי', () => {
  it('שדות המסלול וההערות הפנימיות אינם נכנסים למסמך היומן', async () => {
    const { validateForCompletion } = await import('../../src/schema/pestLog');
    const { validDwellingLog } = await import('../fixtures/sampleLog');

    const content = {
      ...validDwellingLog(),
      // שדות עזר של מסלול העבודה, שנשמרים בטיוטה לצורכי הממשק.
      routeVisitId: 'visit-1',
      routeId: 'route-1',
      internalTeamNote: 'הערה פנימית לצוות',
    };

    const result = validateForCompletion(content, { serverNow: new Date('2026-09-11T08:00:00.000Z') });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snapshot = result.data as Record<string, unknown>;
    expect(snapshot.routeVisitId).toBeUndefined();
    expect(snapshot.routeId).toBeUndefined();
    expect(snapshot.internalTeamNote).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain('הערה פנימית לצוות');
  });
});
