import { afterAll, describe, expect, it } from 'vitest';
import {
  canTransition,
  JOB_STATUSES,
  JOB_TRANSITIONS,
  type Actor,
  type JobStatus,
} from '@/domains/jobs/state-machine';
import { getPool, withSystem } from '@/lib/db';

/**
 * The TypeScript state machine mirrors the `job_transitions` TABLE so the UI
 * can disable impossible actions without a round trip. The database is the
 * source of truth (spec §22), so the two MUST agree exactly — otherwise the
 * UI would offer an action the server then refuses, or hide one it allows.
 *
 * src/domains/jobs/state-machine.ts claims this file asserts that. This is
 * the file that makes the claim true.
 */
interface TransitionRow {
  from_status: JobStatus;
  to_status: JobStatus;
  allow_customer: boolean;
  allow_provider: boolean;
  allow_admin: boolean;
  allow_system: boolean;
}

const ACTORS: Actor[] = ['customer', 'provider', 'admin', 'system'];

describe('state machine parity with the database', () => {
  afterAll(async () => {
    await getPool().end();
  });

  it('the enum in the database matches JOB_STATUSES exactly', async () => {
    const rows = await withSystem((db) =>
      db.many<{ label: string }>(
        `select e.enumlabel as label
           from pg_enum e
           join pg_type t on t.oid = e.enumtypid
          where t.typname = 'job_status'
          order by e.enumsortorder`,
      ),
    );

    expect(rows.map((r) => r.label)).toEqual([...JOB_STATUSES]);
  });

  it('every database transition exists in the TypeScript map, with the same actors', async () => {
    const rows = await withSystem((db) =>
      db.many<TransitionRow>(
        `select from_status::text as from_status, to_status::text as to_status,
                allow_customer, allow_provider, allow_admin, allow_system
           from job_transitions`,
      ),
    );

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(
        canTransition(row.from_status, row.to_status),
        `DB allows ${row.from_status} -> ${row.to_status} but TypeScript does not`,
      ).toBe(true);

      const expected: Record<Actor, boolean> = {
        customer: row.allow_customer,
        provider: row.allow_provider,
        admin: row.allow_admin,
        system: row.allow_system,
      };

      for (const actor of ACTORS) {
        expect(
          canTransition(row.from_status, row.to_status, actor),
          `${row.from_status} -> ${row.to_status} for "${actor}": ` +
            `DB says ${expected[actor]}, TypeScript says ${canTransition(row.from_status, row.to_status, actor)}`,
        ).toBe(expected[actor]);
      }
    }
  });

  it('every TypeScript transition exists in the database', async () => {
    const rows = await withSystem((db) =>
      db.many<{ from_status: JobStatus; to_status: JobStatus }>(
        `select from_status::text as from_status, to_status::text as to_status
           from job_transitions`,
      ),
    );
    const inDb = new Set(rows.map((r) => `${r.from_status}->${r.to_status}`));

    for (const status of JOB_STATUSES) {
      for (const rule of JOB_TRANSITIONS[status]) {
        expect(
          inDb.has(`${status}->${rule.to}`),
          `TypeScript allows ${status} -> ${rule.to} but the database does not`,
        ).toBe(true);
      }
    }
  });

  it('the database enforces can_transition() identically to the TypeScript guard', async () => {
    // Exhaustive: every ordered pair of statuses, checked both ways.
    const disagreements: string[] = [];

    for (const from of JOB_STATUSES) {
      for (const to of JOB_STATUSES) {
        if (from === to) continue;
        const inTs = canTransition(from, to);
        const row = await withSystem((db) =>
          db.one<{ allowed: boolean }>('select can_transition($1::job_status, $2::job_status) as allowed', [
            from,
            to,
          ]),
        );
        if (row?.allowed !== inTs) {
          disagreements.push(`${from} -> ${to}: db=${row?.allowed} ts=${inTs}`);
        }
      }
    }

    expect(disagreements).toEqual([]);
  });
});
