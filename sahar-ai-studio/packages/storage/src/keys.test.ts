import { describe, expect, it } from 'vitest';
import { assetObjectKey } from './keys';

describe('assetObjectKey', () => {
  it('builds owner-scoped keys', () => {
    expect(assetObjectKey('cmabc12345', 'cmdef67890', 'original.mp3')).toBe(
      'users/cmabc12345/cmdef67890/original.mp3',
    );
  });

  it('rejects anything that could escape the prefix', () => {
    expect(() => assetObjectKey('../etc', 'cmdef67890', 'x.mp3')).toThrow();
    expect(() => assetObjectKey('cmabc12345', 'a/b', 'x.mp3')).toThrow();
    expect(() => assetObjectKey('cmabc12345', 'cmdef67890', '../x')).toThrow();
    expect(() => assetObjectKey('cmabc12345', 'cmdef67890', 'a/b.mp3')).toThrow();
    expect(() => assetObjectKey('cmabc12345', 'cmdef67890', '')).toThrow();
  });
});
