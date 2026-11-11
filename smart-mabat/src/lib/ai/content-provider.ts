import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "../env";
import { SYSTEM_PROMPT, buildUserPrompt, type GenerationContext } from "./prompts";
import { CATEGORIES } from "../content/topics";

export const GeneratedPostSchema = z.object({
  topic: z.string().describe("נושא הפוסט במשפט קצר"),
  hook: z.string().describe("שורת הפתיח"),
  headline: z.string().describe("2-5 מילים לתמונה"),
  caption: z.string().describe("גוף הפוסט כולל הפתיח וההנעה לפעולה, בלי האשטגים"),
  hashtags: z.array(z.string()),
  cta: z.string(),
  image_prompt: z.string(),
  alt_text: z.string(),
});
export type GeneratedPost = z.infer<typeof GeneratedPostSchema>;

export interface ContentProvider {
  name: string;
  model: string;
  generate(ctx: GenerationContext): Promise<GeneratedPost>;
}

/** Claude via the official Anthropic SDK with structured (schema-validated) output. */
class ClaudeProvider implements ContentProvider {
  name = "claude";
  model = env.aiModel();
  private client = new Anthropic({ apiKey: env.anthropicKey() });

  async generate(ctx: GenerationContext): Promise<GeneratedPost> {
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      // If the primary model declines a request, the API retries it on a fallback model in the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(GeneratedPostSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserPrompt(ctx) }],
    });

    if (response.stop_reason === "refusal") {
      throw new Error(`המודל סירב ליצור את הפוסט (${response.stop_details?.category ?? "ללא קטגוריה"})`);
    }
    if (response.stop_reason === "max_tokens") throw new Error("תשובת המודל נקטעה (max_tokens)");
    if (!response.parsed_output) throw new Error("המודל לא החזיר JSON תקין");
    return response.parsed_output;
  }
}

/**
 * Offline provider for test mode without an API key. Uses only generic, true, non-specific tips,
 * so it is safe — but it is NOT AI, and it repeats quickly. Use it to test the pipeline.
 */
class MockProvider implements ContentProvider {
  name = "mock";
  model = "mock-templates";

  async generate(ctx: GenerationContext): Promise<GeneratedPost> {
    const cat = CATEGORIES.find((c) => c.key === ctx.categoryKey) ?? CATEGORIES[0];
    const unused = cat.angles.filter((a) => !ctx.recentTopics.includes(a));
    const angle = (unused.length ? unused : cat.angles)[Math.floor(Math.random() * (unused.length || cat.angles.length))];
    const stamp = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
    const body = shuffle(GENERIC_TIPS).slice(0, 3);
    return {
      topic: angle,
      hook: `🔍 ${angle}`,
      headline: cat.label.split(" ").slice(0, 4).join(" "),
      caption: [
        `🔍 ${angle}`,
        "",
        `[פוסט בדיקה – נוצר ללא AI, ${stamp}]`,
        ...body.map((t) => `✔️ ${t}`),
        "",
        `👈 ${ctx.settings.cta_text}`,
      ].join("\n"),
      hashtags: ["#אבטחה", "#מצלמותאבטחה", "#ביטחון", "#אבטחתמידע", "#SecurityCameras", "#CCTV"],
      cta: ctx.settings.cta_text,
      image_prompt:
        "Professional dark-themed product photo of a modern white IP security camera mounted on a dark wall, blue accent lighting, shallow depth of field, no text",
      alt_text: `תמונה המדגימה ${cat.label}`,
    };
  }
}

const GENERIC_TIPS = [
  "לפני שבוחרים מצלמות, כדאי למפות את נקודות הכניסה והיציאה של המקום.",
  "מצלמה שמכוונת נכון שווה יותר ממצלמה יקרה שמכוונת לא נכון.",
  "כדאי לוודא מדי פעם שהמערכת באמת מקליטה ושההקלטות נשמרות.",
  "סיסמה חזקה ועדכוני תוכנה הם חלק מאבטחת מערכת המצלמות עצמה.",
  "תאורה טובה בחצר ובכניסה משפרת משמעותית את איכות התמונה בלילה.",
  "שילוב של מצלמות ואזעקה נותן גם התרעה וגם תיעוד.",
  "תשתית רשת יציבה היא הבסיס לכל מערכת מצלמות מודרנית.",
  "PoE מאפשר להעביר חשמל ותקשורת באותו כבל ומפשט את ההתקנה.",
  "בבניין משותף חשוב לתאם עם הדיירים את מיקום המצלמות בשטחים המשותפים.",
  "כדאי לכוון מצלמות כך שלא יצלמו שטח פרטי של שכנים.",
  "צפייה מרחוק מהנייד מאפשרת לבדוק מה קורה גם כשאתם לא במקום.",
  "שלט 'המקום מצולם' הוא גם אמצעי הרתעה וגם שקיפות כלפי המבקרים.",
  "תחזוקה תקופתית – ניקוי עדשות ובדיקת זוויות – שומרת על תמונה חדה.",
  "כדאי לשמור את מכשיר ההקלטה במקום מוגן ולא גלוי לעין.",
  "לפני חופשה כדאי לבדוק שהמערכת מחוברת ושההתראות לנייד פעילות.",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getContentProvider(): ContentProvider {
  return env.anthropicKey() ? new ClaudeProvider() : new MockProvider();
}
