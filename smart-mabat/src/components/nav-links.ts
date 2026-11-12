import {
  IconCalendar,
  IconChart,
  IconHistory,
  IconHome,
  IconImage,
  IconInstagram,
  IconLog,
  IconQueue,
  IconSettings,
} from "./icons";


export const MAIN = [
  { href: "/", label: "ראשי", Icon: IconHome },
  { href: "/posts", label: "פוסטים", Icon: IconQueue },
  { href: "/calendar", label: "לוח", Icon: IconCalendar },
  { href: "/media", label: "תמונות", Icon: IconImage },
];
export const EXTRA = [
  { href: "/history", label: "היסטוריה", Icon: IconHistory },
  { href: "/analytics", label: "ביצועים", Icon: IconChart },
  { href: "/instagram", label: "אינסטגרם", Icon: IconInstagram },
  { href: "/settings", label: "הגדרות סוכן", Icon: IconSettings },
  { href: "/logs", label: "יומן פעולות", Icon: IconLog },
];

