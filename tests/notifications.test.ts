import { describe, expect, it } from 'vitest';
import { isWithinQuietHours } from '@/lib/services/notifications';
import { renderTemplate, templates } from '@/lib/services/notifications/templates';
import type { NotificationEvent } from '@/lib/services/notifications/types';

describe('quiet hours', () => {
  const at = (hours: number, minutes = 0) => {
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  it('covers a window that wraps midnight', () => {
    expect(isWithinQuietHours('22:00', '07:00', at(23))).toBe(true);
    expect(isWithinQuietHours('22:00', '07:00', at(2))).toBe(true);
    expect(isWithinQuietHours('22:00', '07:00', at(6, 59))).toBe(true);
  });

  it('is inactive during the day', () => {
    expect(isWithinQuietHours('22:00', '07:00', at(9))).toBe(false);
    expect(isWithinQuietHours('22:00', '07:00', at(21, 59))).toBe(false);
  });

  it('handles a same-day window', () => {
    expect(isWithinQuietHours('13:00', '15:00', at(14))).toBe(true);
    expect(isWithinQuietHours('13:00', '15:00', at(16))).toBe(false);
  });

  it('treats the start as inclusive and the end as exclusive', () => {
    expect(isWithinQuietHours('22:00', '07:00', at(22, 0))).toBe(true);
    expect(isWithinQuietHours('22:00', '07:00', at(7, 0))).toBe(false);
  });
});

describe('notification templates', () => {
  it('renders every event with a title and a body', () => {
    // Enumerated from the map rather than listed here, so a new event cannot
    // be added without copy that renders.
    const events = Object.keys(templates) as NotificationEvent[];

    for (const event of events) {
      const rendered = renderTemplate(event, {
        jobTitle: 'נזילה במטבח',
        providerName: 'א.ב. אינסטלציה',
        customerName: 'נועה',
        price: '₪350',
        commission: '₪90',
        balance: '₪410',
        shortfall: '₪100',
        reason: 'הלקוח ביטל',
        eta: '25 דק׳',
        rating: 5,
      });
      expect(rendered.title.length).toBeGreaterThan(0);
      expect(rendered.body.length).toBeGreaterThan(0);
    }
  });

  it('degrades gracefully when no context is supplied', () => {
    const rendered = renderTemplate('new_offer');
    expect(rendered.body).toContain('בעל מקצוע');
  });

  it('includes the price when one is given', () => {
    expect(renderTemplate('new_offer', { price: '₪350' }).body).toContain('₪350');
  });
});
