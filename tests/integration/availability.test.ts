import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { runDispatchWave } from '@/domains/matching/dispatch';
import { getPool, withSystem } from '@/lib/db';
import {
  adminPool,
  advanceJobTo,
  cleanupTestData,
  closeAdminPool,
  createCustomer,
  createJob,
  createProvider,
  createScheduledJob,
  currentLocalHHMM,
  localDate,
  localTime,
  setOnlineUntil,
  setOverride,
  setSchedule,
  weekdayFor,
} from '../helpers/fixtures';

const LOC = { lat: 32.0742, lon: 34.7749 };

const availableAt = (providerId: string, at: Date, durationMin = 60) =>
  withSystem((db) =>
    db.one<{ ok: boolean }>(
      'select provider_is_available_at($1,$2,$3) as ok',
      [providerId, at, durationMin],
    ),
  ).then((r) => r?.ok ?? false);

/**
 * Availability (spec §7–§14, §52–§54).
 *
 * Two separate concepts had to coexist: the realtime switch answering "can I
 * take a job right now?", and the planned schedule answering "when do I
 * work?". The test that matters is §52's: changing the requested time must
 * change WHO IS ELIGIBLE, not merely the wording on screen.
 */
describe('provider availability', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await closeAdminPool();
    await getPool().end();
  });

  it('THE §52 CASE: requested time flips eligibility between two providers', async () => {
    const customer = await createCustomer();

    // Online now, but works only today.
    const onlineToday = await createProvider({ name: 'זמין היום', lat: 32.078, lon: 34.776 });
    await setSchedule(onlineToday.id, [
      { weekday: await weekdayFor(0), startsAt: '00:00', endsAt: '23:59' },
    ]);

    // Offline now, but works tomorrow 08:00–14:00.
    const offlineTomorrow = await createProvider({
      name: 'זמין מחר', lat: 32.079, lon: 34.777, state: 'OFFLINE',
    });
    await setSchedule(offlineTomorrow.id, [
      { weekday: await weekdayFor(1), startsAt: '08:00', endsAt: '14:00' },
    ]);

    // ── NOW: the online provider is eligible, the offline one is not.
    const nowJob = await createJob({ customerId: customer.id, ...LOC });
    await runDispatchWave(nowJob);
    const nowOffers = await adminPool().query(
      'select provider_id from job_offers where job_id = $1',
      [nowJob],
    );
    const nowIds = nowOffers.rows.map((r: { provider_id: string }) => r.provider_id);
    expect(nowIds).toContain(onlineToday.id);
    expect(nowIds).not.toContain(offlineTomorrow.id);

    // ── TOMORROW 10:00: it inverts.
    const tomorrowJob = await createScheduledJob({
      customerId: customer.id,
      requestedFor: await localTime(1, '10:00'),
      ...LOC,
    });
    await runDispatchWave(tomorrowJob);
    const laterOffers = await adminPool().query(
      'select provider_id from job_offers where job_id = $1',
      [tomorrowJob],
    );
    const laterIds = laterOffers.rows.map((r: { provider_id: string }) => r.provider_id);

    // Offline right now, yet eligible for tomorrow — the whole point.
    expect(laterIds).toContain(offlineTomorrow.id);
    // Online right now, yet NOT eligible tomorrow: no hours declared then.
    expect(laterIds).not.toContain(onlineToday.id);
  });

  it('a realtime switch alone decides a NOW request', async () => {
    const online = await createProvider({ name: 'דלוק' });
    const offline = await createProvider({ name: 'כבוי', state: 'OFFLINE' });

    expect(await availableAt(online.id, new Date())).toBe(true);
    expect(await availableAt(offline.id, new Date())).toBe(false);
  });

  it('planned hours decide a future request, whatever the switch says', async () => {
    const provider = await createProvider({ name: 'מתוכנן', state: 'OFFLINE' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(2), startsAt: '09:00', endsAt: '17:00' },
    ]);

    expect(await availableAt(provider.id, await localTime(2, '10:00'))).toBe(true);
    expect(await availableAt(provider.id, await localTime(2, '20:00'))).toBe(false);
    // A different day entirely.
    expect(await availableAt(provider.id, await localTime(3, '10:00'))).toBe(false);
  });

  it('the job must FIT the window, not merely start inside it (spec §53)', async () => {
    const provider = await createProvider({ state: 'OFFLINE' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(1), startsAt: '08:00', endsAt: '14:00' },
    ]);

    const at = await localTime(1, '13:30');
    expect(await availableAt(provider.id, at, 30)).toBe(true);   // ends 14:00
    expect(await availableAt(provider.id, at, 90)).toBe(false);  // would run to 15:00
  });

  it('a date override beats the weekly schedule', async () => {
    const provider = await createProvider({ state: 'OFFLINE' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(1), startsAt: '08:00', endsAt: '18:00' },
    ]);
    const at = await localTime(1, '10:00');
    expect(await availableAt(provider.id, at)).toBe(true);

    const { rows } = await adminPool().query<{ d: string }>(
      `select ((now() + interval '1 day') at time zone availability_timezone())::date::text as d`,
    );
    await setOverride(provider.id, rows[0]!.d, 'unavailable');
    expect(await availableAt(provider.id, at)).toBe(false);
  });

  it('a window override replaces the weekly hours for that date', async () => {
    const provider = await createProvider({ state: 'OFFLINE' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(1), startsAt: '08:00', endsAt: '12:00' },
    ]);
    const { rows } = await adminPool().query<{ d: string }>(
      `select ((now() + interval '1 day') at time zone availability_timezone())::date::text as d`,
    );
    // Works late that day instead.
    await setOverride(provider.id, rows[0]!.d, 'window', '16:00', '22:00');

    expect(await availableAt(provider.id, await localTime(1, '09:00'))).toBe(false);
    expect(await availableAt(provider.id, await localTime(1, '17:00'))).toBe(true);
  });

  it('an override also overrides the realtime switch for a NOW request', async () => {
    const provider = await createProvider({ name: 'לא היום', state: 'ONLINE' });
    const { rows } = await adminPool().query<{ d: string }>(
      `select (now() at time zone availability_timezone())::date::text as d`,
    );
    await setOverride(provider.id, rows[0]!.d, 'unavailable');

    // Switched on, but explicitly not working today.
    expect(await availableAt(provider.id, new Date())).toBe(false);
  });

  it('a provider who declared no hours stays matchable via the switch', async () => {
    // Keeps existing providers working rather than silently dropping everyone
    // who never opened the schedule screen.
    const provider = await createProvider({ name: 'ללא לוח זמנים' });
    await setSchedule(provider.id, []);
    expect(await availableAt(provider.id, new Date())).toBe(true);
    // But a future slot needs a declared plan.
    expect(await availableAt(provider.id, await localTime(2, '10:00'))).toBe(false);
  });

  it('an unverified provider is never available, however they are configured', async () => {
    const provider = await createProvider({ verification: 'PENDING', state: 'ONLINE' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(0), startsAt: '00:00', endsAt: '23:59' },
    ]);
    expect(await availableAt(provider.id, new Date())).toBe(false);
  });

  it('does not double-book: an accepted job blocks the overlapping slot (spec §54)', async () => {
    const customer = await createCustomer();
    const provider = await createProvider({ state: 'OFFLINE' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(1), startsAt: '08:00', endsAt: '18:00' },
    ]);

    const slot = await localTime(1, '10:00');
    expect(await availableAt(provider.id, slot)).toBe(true);

    // Book them at 10:00 tomorrow.
    const booked = await createScheduledJob({ customerId: customer.id, requestedFor: slot });
    const { rows: offer } = await adminPool().query<{ id: string }>(
      `insert into job_offers (job_id, provider_id, price_ils, expires_at)
       values ($1,$2,290, now() + interval '1 hour') returning id`,
      [booked, provider.id],
    );
    await adminPool().query(
      `insert into job_assignments (job_id, provider_id, offer_id, price_ils)
       values ($1,$2,$3,290)`,
      [booked, provider.id, offer[0]!.id],
    );
    // Only ACCEPTED work blocks a slot. A job merely out for offers must not,
    // or a provider would be blocked by every job they were ever shown — so
    // the booking has to reach PROVIDER_SELECTED to count.
    await advanceJobTo(booked, 'PROVIDER_SELECTED');

    // The same slot is now taken, and so is one overlapping it.
    expect(await availableAt(provider.id, slot)).toBe(false);
    expect(await availableAt(provider.id, await localTime(1, '10:30'))).toBe(false);
    // Far enough away to clear the job plus its travel buffer.
    expect(await availableAt(provider.id, await localTime(1, '14:00'))).toBe(true);
  });

  it('a scheduled job matches on service area when there is no live fix', async () => {
    const customer = await createCustomer();
    // Offline, so no live location at all — but works tomorrow.
    const provider = await createProvider({
      name: 'ללא מיקום חי', state: 'OFFLINE', lat: 32.078, lon: 34.776,
    });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(1), startsAt: '08:00', endsAt: '18:00' },
    ]);

    const jobId = await createScheduledJob({
      customerId: customer.id,
      requestedFor: await localTime(1, '10:00'),
      ...LOC,
    });
    const outcome = await runDispatchWave(jobId);
    expect(outcome.offersCreated).toBeGreaterThan(0);

    // And the offer must not pretend to know their route.
    const { rows } = await adminPool().query(
      'select is_on_the_way, eta_confidence from job_offers where job_id = $1',
      [jobId],
    );
    expect(rows[0].is_on_the_way).toBe(false);
  });

  it('reports the next available slot in human terms (spec §55)', async () => {
    const provider = await createProvider({ state: 'OFFLINE' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(3), startsAt: '09:00', endsAt: '17:00' },
    ]);

    const next = await withSystem((db) =>
      db.one<{ at: Date | null }>('select provider_next_available_at($1) as at', [provider.id]),
    );
    expect(next?.at).not.toBeNull();

    const { rows } = await adminPool().query<{ hhmm: string; dow: number }>(
      `select to_char($1::timestamptz at time zone availability_timezone(),'HH24:MI') as hhmm,
              extract(dow from $1::timestamptz at time zone availability_timezone())::int as dow`,
      [next!.at],
    );
    expect(rows[0]!.dow).toBe(await weekdayFor(3));
    expect(rows[0]!.hhmm >= '09:00' && rows[0]!.hhmm <= '17:00').toBe(true);
  });
  /**
   * Regression: the weekly plan used to veto the realtime switch for a NOW
   * request, because both a date override and an uncovered hour came back
   * from the same function as plain `false`. A provider with normal weekday
   * hours who tapped "accepting jobs" in the evening was shown as available
   * and matched as unavailable. Spec §11 puts REALTIME above PLANNED for
   * exactly this reason — the switch is the more specific, more recent
   * statement — while DATE OVERRIDE stays above both.
   */
  it('the realtime switch beats the weekly plan for a NOW request', async () => {
    const provider = await createProvider({ name: 'משמרת חריגה' });
    // Declares hours that deliberately EXCLUDE the present moment.
    const today = await weekdayFor(0);
    const nowHHMM = await currentLocalHHMM();
    const windows =
      nowHHMM < '12:00'
        ? [{ weekday: today, startsAt: '18:00', endsAt: '22:00' }]
        : [{ weekday: today, startsAt: '00:00', endsAt: '06:00' }];
    await setSchedule(provider.id, windows);

    // Outside planned hours, but the switch is on: available.
    expect(await availableAt(provider.id, new Date())).toBe(true);

    // ...and the plan still governs a future slot it does not cover.
    expect(await availableAt(provider.id, await localTime(2, '13:30'))).toBe(false);
  });

  it('a date override still beats the switch, even outside planned hours', async () => {
    const provider = await createProvider({ name: 'לא היום' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(0), startsAt: '00:00', endsAt: '23:59' },
    ]);
    expect(await availableAt(provider.id, new Date())).toBe(true);

    await setOverride(provider.id, await localDate(0), 'unavailable');
    expect(await availableAt(provider.id, new Date())).toBe(false);
  });

  /**
   * Temporary availability ("זמין לשעתיים", "זמין עד 18:00"). The expiry is
   * enforced inside provider_is_available_at rather than only by the sweeper,
   * because matching must never depend on a background job having run.
   */
  it('an expired "accepting jobs until" window stops matching immediately', async () => {
    const provider = await createProvider({ name: 'משמרת שהסתיימה' });
    await setSchedule(provider.id, [
      { weekday: await weekdayFor(0), startsAt: '00:00', endsAt: '23:59' },
    ]);

    await setOnlineUntil(provider.id, 30);
    expect(await availableAt(provider.id, new Date())).toBe(true);

    // Already past: no sweeper has run, and matching must still refuse.
    await setOnlineUntil(provider.id, -1);
    expect(await availableAt(provider.id, new Date())).toBe(false);

    // The provider record still SAYS online, which is precisely the state the
    // sweeper exists to reconcile.
    const before = await adminPool().query<{ state: string }>(
      'select state::text as state from provider_profiles where id = $1',
      [provider.id],
    );
    expect(before.rows[0]?.state).toBe('ONLINE');

    const swept = await withSystem((db) =>
      db.one<{ n: number }>('select expire_online_windows() as n'),
    );
    expect(swept?.n).toBeGreaterThanOrEqual(1);

    const after = await adminPool().query<{ state: string; online_until: Date | null }>(
      'select state::text as state, online_until from provider_profiles where id = $1',
      [provider.id],
    );
    expect(after.rows[0]?.state).toBe('OFFLINE');
    expect(after.rows[0]?.online_until).toBeNull();
  });

  it('does not end a shift that has not reached its declared end', async () => {
    const provider = await createProvider({ name: 'עוד במשמרת' });
    await setOnlineUntil(provider.id, 60);

    await withSystem((db) => db.one('select expire_online_windows() as n'));

    const { rows } = await adminPool().query<{ state: string }>(
      'select state::text as state from provider_profiles where id = $1',
      [provider.id],
    );
    expect(rows[0]?.state).toBe('ONLINE');
  });
});
