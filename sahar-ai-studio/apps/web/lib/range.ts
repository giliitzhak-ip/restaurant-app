/**
 * Validates a client Range header. Only a single byte range is supported (what media
 * elements send); anything else is ignored and the full object is served.
 */
export function parseSingleRange(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return undefined;
  const [, start, end] = match;
  if (start === '' && end === '') return undefined;
  if (start !== '' && end !== '' && Number(end) < Number(start)) return undefined;
  return `bytes=${start}-${end}`;
}
