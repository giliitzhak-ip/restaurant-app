import sharp from 'sharp'

/**
 * Renders a clean, branded placeholder photo for demo products. It is clearly
 * a placeholder — no invented packaging, no supplier artwork.
 */
export async function renderPlaceholderImage(title: string, hue: number): Promise<Buffer> {
  const safe = title.replace(/[<>&]/g, '')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 36% 97%)"/>
      <stop offset="100%" stop-color="hsl(${hue} 30% 90%)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="#ffffff"/>
  <rect width="1200" height="1200" fill="url(#bg)"/>
  <rect x="330" y="300" width="540" height="470" rx="46" fill="#ffffff" opacity="0.92"/>
  <rect x="330" y="300" width="540" height="470" rx="46" fill="none" stroke="hsl(${hue} 28% 74%)" stroke-width="4"/>
  <g stroke="hsl(${hue} 34% 58%)" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M440 620 L540 500 L640 620"/>
    <path d="M620 650 L700 560 L770 650"/>
  </g>
  <circle cx="700" cy="440" r="34" fill="hsl(${hue} 42% 66%)"/>
  <text x="600" y="880" text-anchor="middle" font-family="Assistant, Arial, sans-serif" font-size="46" font-weight="700" fill="hsl(${hue} 24% 30%)" direction="rtl">${safe}</text>
  <text x="600" y="946" text-anchor="middle" font-family="Assistant, Arial, sans-serif" font-size="30" fill="hsl(${hue} 14% 50%)" direction="rtl">תמונת המחשה — DEMO</text>
</svg>`
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}
