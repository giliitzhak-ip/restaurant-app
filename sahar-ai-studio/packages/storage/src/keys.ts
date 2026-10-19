/**
 * Object keys are always server-generated from database IDs — never from user input —
 * so they cannot collide or traverse: users/<ownerId>/<assetId>/<name>.
 */
const SAFE_ID = /^[a-z0-9]{8,64}$/i;

export function assetObjectKey(ownerId: string, assetId: string, name: string): string {
  if (!SAFE_ID.test(ownerId) || !SAFE_ID.test(assetId)) throw new Error('Unsafe id in object key');
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(name) || name.includes('..')) {
    throw new Error('Unsafe object name');
  }
  return `users/${ownerId}/${assetId}/${name}`;
}
