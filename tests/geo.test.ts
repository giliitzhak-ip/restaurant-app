import { describe, expect, it } from 'vitest';
import { boundsAround, estimateEtaMinutes, haversineKm, isValidLatLng } from '@/lib/utils/geo';

const telAviv = { lat: 32.0853, lng: 34.7818 };
const jerusalem = { lat: 31.7683, lng: 35.2137 };

describe('haversineKm', () => {
  it('matches the real Tel Aviv–Jerusalem distance', () => {
    // ~54 km as the crow flies.
    expect(haversineKm(telAviv, jerusalem)).toBeGreaterThan(50);
    expect(haversineKm(telAviv, jerusalem)).toBeLessThan(58);
  });

  it('is zero for the same point and symmetric between two', () => {
    expect(haversineKm(telAviv, telAviv)).toBe(0);
    expect(haversineKm(telAviv, jerusalem)).toBeCloseTo(haversineKm(jerusalem, telAviv), 10);
  });
});

describe('isValidLatLng', () => {
  it('accepts real coordinates and rejects impossible ones', () => {
    expect(isValidLatLng(telAviv)).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: 181 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
    expect(isValidLatLng({ lat: Number.NaN, lng: 0 })).toBe(false);
  });
});

describe('estimateEtaMinutes', () => {
  it('grows with distance and never goes below the floor', () => {
    expect(estimateEtaMinutes(0)).toBeGreaterThanOrEqual(3);
    expect(estimateEtaMinutes(10)).toBeGreaterThan(estimateEtaMinutes(2));
  });

  it('returns 0 for nonsense input rather than NaN', () => {
    expect(estimateEtaMinutes(Number.NaN)).toBe(0);
    expect(estimateEtaMinutes(-5)).toBe(0);
  });
});

describe('boundsAround', () => {
  it('produces a box that contains the centre', () => {
    const bounds = boundsAround(telAviv, 5);
    expect(bounds.north).toBeGreaterThan(telAviv.lat);
    expect(bounds.south).toBeLessThan(telAviv.lat);
    expect(bounds.east).toBeGreaterThan(telAviv.lng);
    expect(bounds.west).toBeLessThan(telAviv.lng);
  });

  it('grows with the radius', () => {
    const small = boundsAround(telAviv, 1);
    const large = boundsAround(telAviv, 20);
    expect(large.north - large.south).toBeGreaterThan(small.north - small.south);
  });
});
