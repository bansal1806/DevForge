/**
 * Minimal in-memory stand-in for the supabase-js query builder, enough to
 * drive the API routes in tests. Embedded relations (e.g. `author:users(...)`)
 * are not resolved; filters supported: eq, is, in, order, limit, single/maybeSingle.
 */
import { randomUUID } from 'crypto';

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcHandlers: Record<string, (args: any) => any> = {};

  table(name: string) {
    return (this.tables[name] ||= []);
  }

  seed(name: string, rows: Row[]) {
    this.table(name).push(...rows.map((r) => ({ id: randomUUID(), ...r })));
    return this;
  }
}

class Query implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private limitN?: number;
  private countMode = false;
  private returning = false;

  constructor(private db: FakeDb, private name: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') this.countMode = !!opts?.count;
    else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = ([] as Row[]).concat(rows); return this; }
  upsert(rows: Row | Row[]) { this.op = 'upsert'; this.payload = ([] as Row[]).concat(rows); return this; }
  update(patch: Row) { this.op = 'update'; this.patch = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(col: string, val: any) { this.filters.push((r) => r[col] === val); return this; }
  is(col: string, val: any) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
  in(col: string, vals: any[]) { this.filters.push((r) => vals.includes(r[col])); return this; }
  or() { return this; }
  order() { return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }

  private run() {
    const rows = this.db.table(this.name);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let result: Row[];

    switch (this.op) {
      case 'insert':
      case 'upsert':
        result = this.payload.map((p) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...p }));
        rows.push(...result);
        break;
      case 'update':
        result = rows.filter(match);
        result.forEach((r) => Object.assign(r, this.patch));
        break;
      case 'delete':
        result = rows.filter(match);
        this.db.tables[this.name] = rows.filter((r) => !match(r));
        break;
      default:
        result = rows.filter(match);
    }

    if (this.limitN !== undefined) result = result.slice(0, this.limitN);
    if (this.countMode) return { data: null, error: null, count: result.length };
    if (this.op !== 'select' && !this.returning && this.mode === 'many') return { data: null, error: null };

    if (this.mode === 'many') return { data: result, error: null };
    if (result.length === 0) {
      return this.mode === 'maybe'
        ? { data: null, error: null }
        : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    }
    return { data: result[0], error: null };
  }

  then<T1 = any, T2 = never>(
    onfulfilled?: ((value: any) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}

export function createFakeClient(db: FakeDb, users: Record<string, { id: string; email: string }>) {
  return {
    from: (name: string) => new Query(db, name),
    rpc: async (fn: string, args: any) => {
      const handler = db.rpcHandlers[fn];
      if (!handler) return { data: null, error: { message: `no rpc ${fn}` } };
      return { data: handler(args), error: null };
    },
    auth: {
      getUser: async (token: string) => {
        const user = users[token];
        return user
          ? { data: { user: { ...user, user_metadata: {} } }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } };
      },
      admin: {
        createUser: async () => ({ data: {}, error: null }),
        updateUserById: async () => ({ data: {}, error: null }),
      },
    },
  };
}
