import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { checksPassed, runChecks, type CheckInput } from "@/lib/content/checks";
import { fingerprint, similarity } from "@/lib/content/similarity";
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from "@/lib/crypto";
import { slotsForWeek, TZ, upcomingSlots } from "@/lib/scheduler/slots";
import { categoryWeights, engagementScore, pickWeighted } from "@/lib/scheduler/strategy";

const GOOD = `🔍 איך בוחרים מיקום נכון למצלמה בכניסה לבית?
הכניסה היא הנקודה הראשונה שכדאי לכסות. מצלמה שממוקמת גבוה מדי תראה רק קודקודים,
ומצלמה נמוכה מדי חשופה לפגיעה. כדאי לחשוב על זווית שרואה פנים, על תאורה בלילה,
ועל כך שהמצלמה לא תצלם את השטח של השכנים.
👈 לייעוץ והצעת מחיר – שלחו לנו הודעה בדיירקט`;

function input(over: Partial<CheckInput> = {}): CheckInput {
  return {
    caption: GOOD,
    hashtags: ["#אבטחה", "#מצלמות", "#CCTV", "#ביטחון", "#בית"],
    cta: "שלחו הודעה",
    createdBy: "agent",
    hasMedia: true,
    mediaType: "IMAGE",
    recentCaptions: [],
    ...over,
  };
}

describe("content checks", () => {
  it("passes a clean, generic Hebrew post", () => {
    const r = runChecks(input());
    expect(r.filter((c) => !c.ok && c.severity === "error")).toEqual([]);
    expect(checksPassed(r)).toBe(true);
  });

  it.each([
    ["testimonial", `${GOOD}\nלקוח מרוצה כתב לנו שהמערכת מעולה`],
    ["project", `${GOOD}\nהשבוע התקנו 12 מצלמות במשרד בתל אביב`],
    ["client count", `${GOOD}\nכבר מעל 500 לקוחות בחרו בנו`],
    ["ranking", `${GOOD}\nאנחנו החברה המובילה בתחום`],
    ["specs", `${GOOD}\nמצלמה 8MP עם ראיית לילה`],
    ["model", `${GOOD}\nדגם DS-2CD2143G2`],
    ["price", `${GOOD}\nרק ₪999 להתקנה`],
    ["guarantee", `${GOOD}\n100% הגנה לבית שלכם`],
  ])("blocks fabricated %s in agent posts", (_name, caption) => {
    const r = runChecks(input({ caption }));
    expect(checksPassed(r)).toBe(false);
  });

  it("downgrades fabrication patterns to warnings for admin-written posts", () => {
    const r = runChecks(input({ caption: `${GOOD}\nמצלמה 8MP`, createdBy: "admin" }));
    expect(checksPassed(r)).toBe(true);
    expect(r.find((c) => c.id === "no_specs")?.ok).toBe(false);
  });

  it("requires Hebrew, CTA, media and IG limits", () => {
    expect(checksPassed(runChecks(input({ caption: "This is an English caption ".repeat(5) + " שלחו הודעה" })))).toBe(false);
    expect(checksPassed(runChecks(input({ caption: GOOD.replace(/👈.*$/u, "סוף.") , cta: "" })))).toBe(false);
    expect(checksPassed(runChecks(input({ hasMedia: false })))).toBe(false);
    expect(checksPassed(runChecks(input({ hashtags: Array.from({ length: 31 }, (_, i) => `#t${i}`) })))).toBe(false);
    expect(checksPassed(runChecks(input({ caption: GOOD + "א".repeat(2200) })))).toBe(false);
  });

  it("blocks near-duplicates of recent posts", () => {
    const r = runChecks(input({ recentCaptions: [GOOD.replace("🔍", "") + " #תגית"] }));
    expect(r.find((c) => c.id === "not_duplicate")?.ok).toBe(false);
  });
});

describe("similarity", () => {
  it("ignores punctuation, emoji, niqqud and hashtags", () => {
    expect(fingerprint("שָׁלוֹם, עולם! 🔒 #טסט")).toBe(fingerprint("שלום עולם"));
    expect(similarity(GOOD, GOOD)).toBe(1);
    expect(similarity(GOOD, "מערכת אזעקה לעסק היא שכבת הגנה נוספת שמתריעה מיד בעת פריצה")).toBeLessThan(0.1);
  });
});

describe("crypto", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  it("round-trips AES-GCM and detects tampering", () => {
    const enc = encryptSecret("EAAB-token-123", key);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decryptSecret(enc, key)).toBe("EAAB-token-123");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });
  it("hashes and verifies passwords", () => {
    const h = hashPassword("correct horse battery");
    expect(verifyPassword("correct horse battery", h)).toBe(true);
    expect(verifyPassword("wrong", h)).toBe(false);
  });
});

describe("scheduler (Israel time)", () => {
  const cfg = { posts_per_week: 7, publish_days: [1, 2, 3, 4, 5, 6, 7], publish_times: ["19:00"] };

  it("makes one 19:00 Israel-time slot per day by default", () => {
    const week = slotsForWeek(DateTime.fromISO("2026-11-11T10:00", { zone: TZ }), cfg);
    expect(week).toHaveLength(7);
    expect(week.every((s) => s.setZone(TZ).hour === 19)).toBe(true);
    expect(week[0].setZone(TZ).weekday).toBe(7); // week starts Sunday
  });

  it("handles DST: 19:00 Israel is 17:00 UTC in winter and 16:00 UTC in summer", () => {
    const winter = slotsForWeek(DateTime.fromISO("2026-12-02", { zone: TZ }), cfg)[0];
    const summer = slotsForWeek(DateTime.fromISO("2026-07-01", { zone: TZ }), cfg)[0];
    expect(winter.toUTC().hour).toBe(17);
    expect(summer.toUTC().hour).toBe(16);
  });

  it("thins candidates evenly to posts_per_week", () => {
    const week = slotsForWeek(DateTime.fromISO("2026-11-11", { zone: TZ }), { ...cfg, posts_per_week: 3 });
    expect(week).toHaveLength(3);
    const days = week.map((s) => s.weekday);
    expect(new Set(days).size).toBe(3);
  });

  it("only returns future slots within the window", () => {
    const now = DateTime.fromISO("2026-11-11T18:50", { zone: TZ });
    const slots = upcomingSlots(cfg, 2.5, now, 20);
    // 19:00 today is within the 20-minute lead time → skipped
    expect(slots.map((s) => DateTime.fromISO(s).setZone(TZ).toFormat("dd HH:mm"))).toEqual(["12 19:00", "13 19:00"]);
  });
});

describe("adaptive strategy", () => {
  it("scores engagement per reach", () => {
    expect(engagementScore({ reach: 100, likes: 10, comments: 5, saved: 2, shares: 0 })).toBeCloseTo(0.26);
  });
  it("boosts strong categories and penalises recent ones", () => {
    const w = categoryWeights(
      [
        { category: "alarms", posts: 3, avgScore: 0.3 },
        { category: "nvr", posts: 3, avgScore: 0.1 },
      ],
      ["home"],
    );
    const get = (k: string) => w.find((x) => x.key === k)!.weight;
    expect(get("alarms")).toBeGreaterThan(1);
    expect(get("nvr")).toBeLessThan(1);
    expect(get("home")).toBeLessThan(0.2);
    expect(get("tips")).toBe(1);
  });
  it("picks weighted", () => {
    expect(pickWeighted([{ key: "a", weight: 1, reason: "" }, { key: "b", weight: 3, reason: "" }], () => 0.9)).toBe("b");
  });
});
