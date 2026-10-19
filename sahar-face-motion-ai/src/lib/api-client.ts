/** Client-side JSON POST that always resolves to a Hebrew error message on failure. */
export async function postJson(url: string, body: unknown, method = "POST"): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: data?.error ?? `שגיאת שרת (${res.status}). נסו שוב.` };
  } catch {
    return { ok: false, error: "אין חיבור לשרת. בדקו את חיבור האינטרנט ונסו שוב." };
  }
}
