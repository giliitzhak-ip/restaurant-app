import {
  Ban,
  Check,
  Circle,
  Clock,
  CalendarClock,
  MessageCircle,
  Navigation,
  Phone,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { VISIT_STATUS_PRESENTATION, type VisitStatus } from '@/schema/routes';
import { buildNavigationLinks, isAppleDevice, telLink, whatsappLink } from '@/lib/routes/navigation';
import type { VisitTone } from '@/lib/routes/status';

/** רכיבים משותפים למסכי מסלול העבודה. */

const STATUS_ICONS = {
  circle: Circle,
  navigation: Navigation,
  wrench: Wrench,
  check: Check,
  rotate: RotateCcw,
  clock: Clock,
  calendar: CalendarClock,
  ban: Ban,
} as const;

export function StatusChip({
  status,
  tone,
  alert,
}: {
  status: VisitStatus;
  tone: VisitTone;
  alert?: string | null;
}): React.JSX.Element {
  const presentation = VISIT_STATUS_PRESENTATION[status];
  const Icon = STATUS_ICONS[presentation.icon];
  return (
    <span className={`status-chip tone-${tone}`}>
      <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
      <span>{presentation.label}</span>
      {alert ? <span className="status-chip-alert">· {alert}</span> : null}
    </span>
  );
}

export interface ContactTarget {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  phone: string | null;
  mobile: string | null;
  clientName: string;
}

/**
 * כפתורי ניווט, חיוג ו-WhatsApp.
 * כפתור שאי אפשר לממש (אין כתובת, אין נייד) אינו מוצג כלל — ובמקום
 * ניווט שבור מוצגת הודעה ברורה.
 */
export function ContactActions({
  target,
  compact = false,
}: {
  target: ContactTarget;
  compact?: boolean;
}): React.JSX.Element {
  const navigation = buildNavigationLinks({
    latitude: target.latitude,
    longitude: target.longitude,
    address: target.address,
  });
  const tel = telLink(target.mobile ?? target.phone);
  const whatsapp = whatsappLink(target.mobile, `שלום ${target.clientName}, מדביר בדרך אליכם.`);
  const apple = typeof navigator !== 'undefined' && isAppleDevice(navigator.userAgent);

  return (
    <div className={`btn-row${compact ? ' btn-row-compact' : ''}`}>
      {navigation.ok ? (
        <>
          <a className="btn btn-sm btn-primary" href={navigation.links.waze} target="_blank" rel="noreferrer">
            <Navigation size={16} aria-hidden="true" /> ניווט ב-Waze
          </a>
          <a className="btn btn-sm" href={navigation.links.googleMaps} target="_blank" rel="noreferrer">
            Google Maps
          </a>
          {apple ? (
            <a className="btn btn-sm" href={navigation.links.appleMaps} target="_blank" rel="noreferrer">
              Apple Maps
            </a>
          ) : null}
        </>
      ) : (
        <span className="small tag tag-danger">{navigation.error}</span>
      )}
      {tel ? (
        <a className="btn btn-sm" href={tel}>
          <Phone size={16} aria-hidden="true" /> חיוג
        </a>
      ) : null}
      {whatsapp ? (
        <a className="btn btn-sm" href={whatsapp} target="_blank" rel="noreferrer">
          <MessageCircle size={16} aria-hidden="true" /> WhatsApp
        </a>
      ) : null}
      {!navigation.ok || navigation.links.precise ? null : (
        <span className="small dim">הניווט לפי כתובת — לאתר זה לא נשמרה נקודת ציון.</span>
      )}
    </div>
  );
}
