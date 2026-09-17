import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { adminPool, closeAdminPool } from '../helpers/fixtures';

/**
 * Every table and view the application names must exist.
 *
 * Why this test exists: migration 0017 renamed `provider_availability` to
 * `provider_status_history`, and /api/provider/state kept writing to the old
 * name. Types were clean, lint was clean, the build was clean and 164 tests
 * passed — because SQL inside a template literal is just text, and no test
 * exercised that route's write path. The provider could not go online at all.
 *
 * A per-route test would have caught that one route. This catches the whole
 * class: it reads the SQL out of the source, extracts the relations, and asks
 * the database whether they are there. It is deliberately structural rather
 * than behavioural, so it stays cheap as routes are added.
 */

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

/** Words that can follow FROM/JOIN without naming a relation. */
const NOT_A_RELATION = new Set([
  'select', 'lateral', 'only', 'unnest', 'generate_series', 'jsonb_array_elements',
  'jsonb_to_recordset', 'json_to_recordset', 'jsonb_each', 'jsonb_each_text',
  'string_to_table', 'regexp_split_to_table', 'values', 'row', 'set', 'and', 'or',
  'on', 'using', 'where', 'as', 'by',
]);

interface Reference {
  relation: string;
  file: string;
}

function extractReferences(): Reference[] {
  const found: Reference[] = [];

  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');

    // Template literals are how every query in this codebase is written.
    for (const literal of text.match(/`[^`]*`/g) ?? []) {
      if (!/\b(select|insert\s+into|update|delete\s+from)\b/i.test(literal)) continue;
      // Comments are stripped first: prose inside a SQL comment contains
      // things like "absent from the search", and "the" is not a table.
      const sql = literal
        .slice(1, -1)
        .toLowerCase()
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');

      // CTE names are relations that exist only inside the statement.
      const ctes = new Set<string>();
      for (const match of sql.matchAll(/(?:with|,)\s+([a-z_][a-z0-9_]*)\s+as\s*(?:materialized\s*)?\(/g)) {
        if (match[1]) ctes.add(match[1]);
      }

      const pattern =
        /\b(?:from|join|insert\s+into|update|delete\s+from)\s+((?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*)/g;
      for (const match of sql.matchAll(pattern)) {
        const relation = match[1];
        if (!relation) continue;
        const bare = relation.includes('.') ? (relation.split('.')[1] ?? relation) : relation;
        if (NOT_A_RELATION.has(bare) || ctes.has(relation)) continue;
        // A set-returning function call, e.g. find_candidate_providers(...).
        if (sql.slice(match.index + match[0].length).startsWith('(')) continue;
        found.push({ relation, file: file.replace(`${process.cwd()}/`, '') });
      }
    }
  }

  return found;
}

describe('SQL relation references', () => {
  afterAll(async () => {
    await closeAdminPool();
  });

  it('names relations that all exist in the database', async () => {
    const references = extractReferences();

    // Sanity: if extraction silently broke, an empty set would pass happily.
    expect(references.length).toBeGreaterThan(40);

    const { rows } = await adminPool().query<{ schema: string; name: string }>(
      `select n.nspname as schema, c.relname as name
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','v','m','p','f')
          and n.nspname in ('public','auth')`,
    );

    const exists = new Set<string>();
    for (const row of rows) {
      exists.add(`${row.schema}.${row.name}`);
      if (row.schema === 'public') exists.add(row.name);
    }

    const missing = [...new Set(references.filter((r) => !exists.has(r.relation)).map(
      (r) => `${r.relation} (${r.file})`,
    ))].sort();

    expect(missing).toEqual([]);
  });
});
