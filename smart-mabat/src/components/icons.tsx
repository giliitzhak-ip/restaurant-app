type P = { className?: string };
const base = "h-5 w-5";
const S = ({ className, d }: P & { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className ?? base} aria-hidden>
    <path d={d} />
  </svg>
);

export const IconHome = (p: P) => <S {...p} d="M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10" />;
export const IconQueue = (p: P) => <S {...p} d="M4 6h16M4 12h16M4 18h10" />;
export const IconCalendar = (p: P) => <S {...p} d="M7 3v3m10-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />;
export const IconImage = (p: P) => <S {...p} d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 1 0 0-.01" />;
export const IconMore = (p: P) => <S {...p} d="M5 12h.01M12 12h.01M19 12h.01" />;
export const IconHistory = (p: P) => <S {...p} d="M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2" />;
export const IconChart = (p: P) => <S {...p} d="M4 20V10m6 10V4m6 16v-7m4 7H2" />;
export const IconSettings = (p: P) => <S {...p} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />;
export const IconInstagram = (p: P) => <S {...p} d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm5 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm5.5-9.5h.01" />;
export const IconLog = (p: P) => <S {...p} d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />;
export const IconPlus = (p: P) => <S {...p} d="M12 5v14M5 12h14" />;
export const IconSpark = (p: P) => <S {...p} d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />;
export const IconCheck = (p: P) => <S {...p} d="m5 12 5 5 9-10" />;
export const IconX = (p: P) => <S {...p} d="M6 6l12 12M18 6 6 18" />;
export const IconPlay = (p: P) => <S {...p} d="M7 5v14l11-7z" />;
export const IconPause = (p: P) => <S {...p} d="M8 5v14M16 5v14" />;
export const IconShield = (p: P) => <S {...p} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />;
