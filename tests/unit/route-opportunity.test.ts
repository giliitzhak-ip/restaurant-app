import { describe, expect, it } from 'vitest';
import { EstimateMapProvider } from '@/domains/geo';
import { angularDifferenceDeg, bearingDeg, haversineKm } from '@/domains/geo/math';
import { RouteOpportunityCalculator } from '@/domains/matching/route-opportunity';

const maps = new EstimateMapProvider();
const calculator = new RouteOpportunityCalculator(maps);

// Dizengoff Center, Tel Aviv — the customer.
const CUSTOMER = { lat: 32.0742, lon: 34.7749 };

// 3.2 km NORTH of the customer, driving SOUTH, destination SOUTH of them.
const ON_THE_WAY = {
  providerLocation: { lat: 32.1030, lon: 34.7749 },
  customerLocation: CUSTOMER,
  providerHeadingDeg: 180,
  providerDestination: { lat: 32.0560, lon: 34.7749 },
  providerSpeedKmh: 34,
};

// 1.0 km NORTH of the customer — much closer — but driving NORTH, away.
const DRIVING_AWAY = {
  providerLocation: { lat: 32.0832, lon: 34.7749 },
  customerLocation: CUSTOMER,
  providerHeadingDeg: 0,
  providerDestination: { lat: 32.2100, lon: 34.7900 },
  providerSpeedKmh: 34,
};

describe('geo math', () => {
  it('measures bearing due north and due south', () => {
    expect(bearingDeg({ lat: 32.0, lon: 34.0 }, { lat: 33.0, lon: 34.0 })).toBeCloseTo(0, 1);
    expect(bearingDeg({ lat: 33.0, lon: 34.0 }, { lat: 32.0, lon: 34.0 })).toBeCloseTo(180, 1);
  });

  it('treats angular difference as the shortest way round the compass', () => {
    expect(angularDifferenceDeg(350, 10)).toBeCloseTo(20, 5);
    expect(angularDifferenceDeg(0, 180)).toBeCloseTo(180, 5);
    expect(angularDifferenceDeg(90, 90)).toBe(0);
  });

  it('agrees with PostGIS on a known Tel Aviv distance', () => {
    // PostGIS ST_Distance for these points returns 1456 m (verified directly
    // against the database during Phase 2).
    const km = haversineKm({ lat: 32.08, lon: 34.78 }, { lat: 32.09, lon: 34.79 });
    expect(km * 1000).toBeGreaterThan(1400);
    expect(km * 1000).toBeLessThan(1500);
  });
});

describe('RouteOpportunityCalculator', () => {
  it('recognises a provider already travelling toward the customer', async () => {
    const result = await calculator.calculate(ON_THE_WAY);

    expect(result.basis).toBe('destination_route');
    expect(result.isOnTheWay).toBe(true);
    // Passing essentially straight through: the detour is near zero.
    expect(result.routeDeviationMinutes).toBeLessThan(2);
    expect(result.opportunityScore).toBeGreaterThan(85);
  });

  it('penalises a closer provider who would have to double back', async () => {
    const result = await calculator.calculate(DRIVING_AWAY);

    expect(result.basis).toBe('destination_route');
    expect(result.isOnTheWay).toBe(false);
    expect(result.routeDeviationMinutes).toBeGreaterThan(6);
  });

  it('THE PRODUCT THESIS: being on the way beats being closer (spec §15)', async () => {
    const onTheWay = await calculator.calculate(ON_THE_WAY);
    const closer = await calculator.calculate(DRIVING_AWAY);

    // The "closer" provider really is closer in a straight line...
    const onTheWayKm = haversineKm(ON_THE_WAY.providerLocation, CUSTOMER);
    const closerKm = haversineKm(DRIVING_AWAY.providerLocation, CUSTOMER);
    expect(closerKm).toBeLessThan(onTheWayKm);

    // ...and still must score lower, because it is going the wrong way.
    expect(onTheWay.opportunityScore).toBeGreaterThan(closer.opportunityScore);
  });

  it('falls back to heading when no destination is known, and caps the score', async () => {
    const result = await calculator.calculate({ ...ON_THE_WAY, providerDestination: null });

    expect(result.basis).toBe('heading');
    expect(result.headingOffsetDeg).toBeCloseTo(0, 0);
    expect(result.isOnTheWay).toBe(true);
    // Inference must never score as high as a measured route (see config).
    expect(result.opportunityScore).toBeLessThanOrEqual(78);
  });

  it('ignores heading from a stationary provider rather than trusting noise', async () => {
    const result = await calculator.calculate({
      ...ON_THE_WAY,
      providerDestination: null,
      providerSpeedKmh: 0,
    });

    expect(result.basis).toBe('proximity_only');
    expect(result.isOnTheWay).toBe(false);
    expect(result.headingOffsetDeg).toBeNull();
  });

  it('never claims to be on the way without any direction signal', async () => {
    const result = await calculator.calculate({
      ...ON_THE_WAY,
      providerDestination: null,
      providerHeadingDeg: null,
    });

    expect(result.basis).toBe('proximity_only');
    expect(result.isOnTheWay).toBe(false);
    // Proximity alone is capped below the heading tier.
    expect(result.opportunityScore).toBeLessThan(78);
  });

  it('marks every estimated figure as estimated, never as routed', async () => {
    const result = await calculator.calculate(ON_THE_WAY);
    expect(result.confidence).toBe('estimated');
  });
});
