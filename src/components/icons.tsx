import type { ReactNode } from 'react';

/**
 * ערכת אייקונים מקורית, בקו אחיד (stroke) ובגודל אחיד.
 * אין שימוש בנכסים או באייקונים של צד שלישי.
 */

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

const wrap = (children: ReactNode) => <svg {...base}>{children}</svg>;

export const IconHome = () => wrap(<><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9.8V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.8" /><path d="M10 20v-5h4v5" /></>);

export const IconJournal = () => wrap(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18" /><path d="M11.5 8h5" /><path d="M11.5 12h5" /><path d="M11.5 16h3" /></>);

export const IconCustomers = () => wrap(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16 8.2a3 3 0 0 1 0 5.6" /><path d="M17.5 19.5c0-2.2-.9-3.9-2.2-4.8" /></>);

export const IconRoute = () => wrap(<><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M6 8.2v4.3a3.5 3.5 0 0 0 3.5 3.5H16" /><path d="M14 13.8 16.2 16 14 18.2" /></>);

export const IconTemplates = () => wrap(<><rect x="3.5" y="3.5" width="11" height="11" rx="2" /><path d="M8 17.5v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1" /></>);

export const IconTasks = () => wrap(<><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8.5 12.2l2.3 2.3 4.7-5" /></>);

export const IconCalendar = () => wrap(<><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17" /><path d="M8 3.5V6" /><path d="M16 3.5V6" /><circle cx="8.5" cy="13.5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="13.5" r="1" fill="currentColor" stroke="none" /></>);

export const IconMaterials = () => wrap(<><path d="M10 3.5h4" /><path d="M11 3.5v5.2L6.6 17a2 2 0 0 0 1.7 3h7.4a2 2 0 0 0 1.7-3L13 8.7V3.5" /><path d="M8.2 14.5h7.6" /></>);

export const IconProfile = () => wrap(<><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>);

export const IconPlus = () => wrap(<><path d="M12 5v14" /><path d="M5 12h14" /></>);

export const IconMore = () => wrap(<><circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" /></>);

export const IconMoon = () => wrap(<path d="M20 14.2A8 8 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z" />);

export const IconSun = () => wrap(<><circle cx="12" cy="12" r="4" /><path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5l-1.5 1.5M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5" /></>);

export const IconChevron = () => wrap(<path d="M14 6l-6 6 6 6" />);
