/**
 * Navigation deep links.
 *
 * Client-safe and provider-agnostic: GET SERVICE never builds its own
 * turn-by-turn navigation, it hands the destination to the device's map app.
 * Apple Maps on iOS, Google Maps everywhere else.
 */
export function navigationUrlFor(lat: number, lng: number, label?: string): string {
  const destination = `${lat},${lng}`;
  const name = label ? encodeURIComponent(label) : '';

  if (typeof navigator !== 'undefined' && /iP(hone|ad|od)|Macintosh/.test(navigator.userAgent)) {
    return `https://maps.apple.com/?daddr=${destination}${name ? `&q=${name}` : ''}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
