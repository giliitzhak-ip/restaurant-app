/**
 * A small in-memory stand-in for the Supabase client.
 *
 * It supports the subset of the query builder the payment and job services
 * actually use — enough to exercise those flows end to end without a database,
 * while staying obviously a test double rather than a reimplementation.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

interface Result<T> {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number;
}

class FakeQuery implements PromiseLike<Result<unknown>> {
  private filters: Filter[] = [];
  private mode: 'many' | 'single' | 'maybeSingle' = 'many';
  private operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row[] = [];
  private conflictColumns: string[] = [];
  private ignoreDuplicates = false;
  private limitCount: number | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private wantsCount = false;

  constructor(
    private readonly table: string,
    private readonly store: Map<string, Row[]>,
  ) {}

  private rows(): Row[] {
    return this.store.get(this.table) ?? [];
  }

  private matching(): Row[] {
    return this.rows().filter((row) => this.filters.every((filter) => filter(row)));
  }

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.operation === 'select') this.operation = 'select';
    if (options?.count) this.wantsCount = true;
    return this;
  }

  insert(values: Row | Row[]) {
    this.operation = 'insert';
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.operation = 'upsert';
    this.payload = Array.isArray(values) ? values : [values];
    this.conflictColumns = options?.onConflict?.split(',').map((column) => column.trim()) ?? ['id'];
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }

  update(values: Row) {
    this.operation = 'update';
    this.payload = [values];
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  not(column: string, _operator: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  gte(column: string, value: string | number) {
    this.filters.push((row) => (row[column] as string | number) >= value);
    return this;
  }

  gt(column: string, value: string | number) {
    this.filters.push((row) => (row[column] as string | number) > value);
    return this;
  }

  lte(column: string, value: string | number) {
    this.filters.push((row) => (row[column] as string | number) <= value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.limitCount = to - from + 1;
    return this;
  }

  single() {
    this.mode = 'single';
    return this;
  }

  maybeSingle() {
    this.mode = 'maybeSingle';
    return this;
  }

  private execute(): Result<unknown> {
    const rows = this.store.get(this.table) ?? [];
    let affected: Row[] = [];

    switch (this.operation) {
      case 'insert': {
        affected = this.payload.map((values) => ({
          id: values.id ?? `${this.table}-${rows.length + affected.length + 1}`,
          created_at: new Date().toISOString(),
          ...values,
        }));
        this.store.set(this.table, [...rows, ...affected]);
        break;
      }

      case 'upsert': {
        const next = [...rows];
        affected = [];
        for (const values of this.payload) {
          const index = next.findIndex((row) =>
            this.conflictColumns.every((column) => row[column] === values[column]),
          );
          if (index >= 0) {
            if (this.ignoreDuplicates) {
              affected.push(next[index]);
              continue;
            }
            next[index] = { ...next[index], ...values };
            affected.push(next[index]);
          } else {
            const created = {
              id: values.id ?? `${this.table}-${next.length + 1}`,
              created_at: new Date().toISOString(),
              ...values,
            };
            next.push(created);
            affected.push(created);
          }
        }
        this.store.set(this.table, next);
        break;
      }

      case 'update': {
        const [values] = this.payload;
        affected = [];
        const next = rows.map((row) => {
          if (!this.filters.every((filter) => filter(row))) return row;
          const updated = { ...row, ...values, updated_at: new Date().toISOString() };
          affected.push(updated);
          return updated;
        });
        this.store.set(this.table, next);
        break;
      }

      case 'delete': {
        affected = this.matching();
        this.store.set(
          this.table,
          rows.filter((row) => !this.filters.every((filter) => filter(row))),
        );
        break;
      }

      default: {
        affected = this.matching();
        if (this.orderBy) {
          const { column, ascending } = this.orderBy;
          affected = [...affected].sort((a, b) => {
            const left = a[column] as string | number;
            const right = b[column] as string | number;
            if (left === right) return 0;
            return (left < right ? -1 : 1) * (ascending ? 1 : -1);
          });
        }
        if (this.limitCount !== null) affected = affected.slice(0, this.limitCount);
      }
    }

    if (this.mode === 'single') {
      return affected.length
        ? { data: affected[0], error: null }
        : { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
    }
    if (this.mode === 'maybeSingle') {
      return { data: affected[0] ?? null, error: null };
    }

    return { data: affected, error: null, ...(this.wantsCount ? { count: affected.length } : {}) };
  }

  then<TResult1 = Result<unknown>, TResult2 = never>(
    onfulfilled?: ((value: Result<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }
}

type RpcHandler = (args: Record<string, unknown>) => unknown;

export class FakeSupabase {
  readonly store = new Map<string, Row[]>();
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  constructor(
    seed: Record<string, Row[]> = {},
    private readonly rpcHandlers: Record<string, RpcHandler> = {},
  ) {
    for (const [table, rows] of Object.entries(seed)) {
      this.store.set(table, rows.map((row) => ({ ...row })));
    }
  }

  from(table: string) {
    return new FakeQuery(table, this.store);
  }

  async rpc(name: string, args: Record<string, unknown> = {}) {
    this.rpcCalls.push({ name, args });
    const handler = this.rpcHandlers[name];
    if (!handler) return { data: null, error: { message: `Unknown function ${name}` } };
    return { data: handler(args), error: null };
  }

  table(name: string): Row[] {
    return this.store.get(name) ?? [];
  }
}

/** Cast helper: the services expect a typed SupabaseClient. */
export function asClient<T>(fake: FakeSupabase): T {
  return fake as unknown as T;
}
