/**
 * Content-Disposition with an ASCII fallback plus an RFC 5987 UTF-8 name, so Hebrew
 * filenames survive on iOS Safari and every desktop browser.
 */
export function contentDisposition(kind: 'inline' | 'attachment', filename: string): string {
  const ascii =
    filename
      .replace(/[^\x20-\x7e]+/g, '')
      .replace(/["\\]/g, '')
      .replace(/\s+/g, ' ')
      // A title that was all Hebrew leaves a leading separator behind.
      .replace(/^[\s\-_.]+/, '')
      .trim() || 'download';
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** "לילה של זהב" scene 2 take 1 → "לילה של זהב - scene 2 - take 1 - TEST.mp4" */
export function takeFilename(
  projectTitle: string,
  scenePosition: number,
  takeNumber: number,
  isTest: boolean,
) {
  const safeTitle =
    projectTitle
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
      .trim()
      .slice(0, 80) || 'sahar';
  return `${safeTitle} - scene ${scenePosition + 1} - take ${takeNumber}${isTest ? ' - TEST' : ''}.mp4`;
}
