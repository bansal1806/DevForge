/**
 * Runs the real schema + every migration against an in-process Postgres
 * (PGlite) with stubs for Supabase's auth schema and roles, then verifies
 * the security model and the versioning functions end to end.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

let db: PGlite;

async function asRole<T>(uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${uid ? 'authenticated' : 'anon'}`);
  await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE');
  }
}

const q = <T = any>(sql: string, params?: unknown[]) => db.query<T>(sql, params).then((r) => r.rows);
const one = async <T = any>(sql: string, params?: unknown[]) => (await q<T>(sql, params))[0];

const migrationFiles = () => [
  'supabase_schema.sql',
  ...fs.readdirSync(path.join(ROOT, 'migrations')).sort().map((f) => `migrations/${f}`),
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

    -- Minimal stand-in for Supabase Realtime's schema
    CREATE SCHEMA realtime;
    CREATE TABLE realtime.messages (id bigserial PRIMARY KEY, topic text, extension text, payload jsonb);
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('realtime.topic', true), '') $$;
    GRANT USAGE ON SCHEMA realtime TO anon, authenticated;
    GRANT SELECT, INSERT ON realtime.messages TO authenticated;
    GRANT USAGE ON SEQUENCE realtime.messages_id_seq TO authenticated;
  `);

  for (const file of migrationFiles()) {
    await db.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }
  // Re-applying the whole sequence must be safe (every migration is idempotent)
  for (const file of migrationFiles().filter((f) => f.startsWith('migrations/'))) {
    await db.exec(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  }

  await db.exec(`
    INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
      ('${A}', 'a@x.com', '{"full_name":"Alice"}'), ('${B}', 'b@x.com', '{"full_name":"Bob"}');
  `);
}, 60_000);

describe('users table', () => {
  it('blocks self-promotion to admin', async () => {
    await expect(asRole(A, () => q(`UPDATE users SET role = 'admin' WHERE id = '${A}'`))).rejects.toThrow(/permission denied/);
  });

  it('hides emails from the public API', async () => {
    await expect(asRole(A, () => q('SELECT email FROM users'))).rejects.toThrow(/permission denied/);
    await expect(asRole(null, () => q('SELECT id, name, avatar_url, bio FROM users'))).resolves.toHaveLength(2);
  });

  it("lets users edit their own display fields only", async () => {
    await asRole(A, () => q(`UPDATE users SET name = 'Alice2' WHERE id = '${A}'`));
    await asRole(A, () => q(`UPDATE users SET name = 'hacked' WHERE id = '${B}'`));
    expect((await one(`SELECT name FROM users WHERE id = '${A}'`)).name).toBe('Alice2');
    expect((await one(`SELECT name FROM users WHERE id = '${B}'`)).name).toBe('Bob');
  });
});

describe('repository access (RLS)', () => {
  let priv: string, pub: string, privMain: string, pubMain: string, pubFeat: string;

  beforeAll(async () => {
    await db.exec('SET ROLE service_role');
    priv = (await one(`INSERT INTO repositories (name, owner_id, is_private) VALUES ('secret', '${A}', true) RETURNING id`)).id;
    pub = (await one(`INSERT INTO repositories (name, owner_id, is_private) VALUES ('open', '${A}', false) RETURNING id`)).id;
    privMain = (await one(`INSERT INTO branches (repo_id, name, is_default) VALUES ($1, 'main', true) RETURNING id`, [priv])).id;
    pubMain = (await one(`INSERT INTO branches (repo_id, name, is_default) VALUES ($1, 'main', true) RETURNING id`, [pub])).id;
    pubFeat = (await one(`INSERT INTO branches (repo_id, name) VALUES ($1, 'feat') RETURNING id`, [pub])).id;
    await q(`INSERT INTO files (repo_id, branch_id, path, content) VALUES ($1, $2, 'secret.txt', 'shh')`, [priv, privMain]);
    await db.exec('RESET ROLE');
  });

  it('has no policy recursion and scopes visibility', async () => {
    expect(await asRole(A, () => q('SELECT id FROM repositories'))).toHaveLength(2);
    expect(await asRole(B, () => q('SELECT id FROM repositories'))).toEqual([{ id: pub }]);
    expect(await asRole(null, () => q('SELECT id FROM repositories'))).toEqual([{ id: pub }]);
    expect(await asRole(B, () => q('SELECT * FROM files WHERE repo_id = $1', [priv]))).toHaveLength(0);
  });

  it('blocks writes and impersonation by strangers', async () => {
    await expect(asRole(B, () => q(`INSERT INTO files (repo_id, branch_id, path, content) VALUES ($1, $2, 'x', 'y')`, [priv, privMain])))
      .rejects.toThrow(/row-level security/);
    await expect(asRole(B, () => q(
      `INSERT INTO pull_requests (repo_id, author_id, source_branch_id, target_branch_id, title) VALUES ($1, '${A}', $2, $3, 't')`,
      [pub, pubFeat, pubMain]
    ))).rejects.toThrow(/row-level security/);
  });

  it('honours collaborator levels', async () => {
    await db.exec('SET ROLE service_role');
    await q(`INSERT INTO repo_collaborators (repo_id, user_id, permission) VALUES ($1, '${B}', 'read')`, [priv]);
    await db.exec('RESET ROLE');

    expect(await asRole(B, () => q('SELECT id FROM repositories WHERE id = $1', [priv]))).toHaveLength(1);
    await expect(asRole(B, () => q(`INSERT INTO files (repo_id, branch_id, path, content) VALUES ($1, $2, 'x', 'y')`, [priv, privMain])))
      .rejects.toThrow(/row-level security/);
    await expect(asRole(B, () => q('SELECT * FROM repo_collaborators'))).resolves.toBeDefined();
  });

  it('rejects cross-repo references even for the service role', async () => {
    await db.exec('SET ROLE service_role');
    try {
      await expect(q(`INSERT INTO files (repo_id, branch_id, path, content) VALUES ($1, $2, 'x', 'y')`, [priv, pubMain]))
        .rejects.toThrow(/does not belong/);
      await expect(q(
        `INSERT INTO pull_requests (repo_id, author_id, source_branch_id, target_branch_id, title) VALUES ($1, '${A}', $2, $3, 't')`,
        [priv, pubMain, privMain]
      )).rejects.toThrow(/must belong/);
      await expect(q(`INSERT INTO branches (repo_id, name, is_default) VALUES ($1, 'other', true)`, [priv]))
        .rejects.toThrow(/duplicate key/);
      await expect(q(`INSERT INTO branches (repo_id, name) VALUES ($1, '../evil')`, [priv]))
        .rejects.toThrow(/branches_name_format/);
    } finally {
      await db.exec('RESET ROLE');
    }
  });
});

describe('commits and three-way merge', () => {
  let repo: string, main: string;

  const files = async (branch: string) =>
    Object.fromEntries((await q<{ path: string; content: string }>(`SELECT path, content FROM files WHERE branch_id = $1`, [branch])).map((r) => [r.path, r.content]));
  const commit = (branch: string, msg: string) => one(`SELECT * FROM create_commit($1, $2, '${A}', $3)`, [repo, branch, msg]);
  const branchFrom = async (name: string) => {
    const id = (await one(`INSERT INTO branches (repo_id, name, last_commit_id) SELECT $1, $2, last_commit_id FROM branches WHERE id = $3 RETURNING id`, [repo, name, main])).id;
    await q(`INSERT INTO files (repo_id, branch_id, path, content) SELECT repo_id, $2, path, content FROM files WHERE branch_id = $1`, [main, id]);
    return id as string;
  };
  const openPr = async (source: string) =>
    (await one(`INSERT INTO pull_requests (repo_id, author_id, source_branch_id, target_branch_id, title) VALUES ($1, '${A}', $2, $3, 'pr') RETURNING id`, [repo, source, main])).id;
  const merge = async (pr: string) => (await one(`SELECT merge_pull_request($1, '${A}') AS r`, [pr])).r;

  beforeAll(async () => {
    await db.exec('SET ROLE service_role');
    repo = (await one(`INSERT INTO repositories (name, owner_id) VALUES ('merge-lab', '${A}') RETURNING id`)).id;
    main = (await one(`INSERT INTO branches (repo_id, name, is_default) VALUES ($1, 'main', true) RETURNING id`, [repo])).id;
    await q(`INSERT INTO files (repo_id, branch_id, path, content) VALUES ($1, $2, 'a.txt', 'base-a'), ($1, $2, 'b.txt', 'base-b'), ($1, $2, 'c.txt', 'base-c')`, [repo, main]);
  });

  it('records ancestry and finds the merge base', async () => {
    const c1 = await commit(main, 'init');
    expect(c1.parent_id).toBeNull();

    const feat = await branchFrom('feature/x');
    await q(`UPDATE files SET content = 'feat-a' WHERE branch_id = $1 AND path = 'a.txt'`, [feat]);
    await q(`DELETE FROM files WHERE branch_id = $1 AND path = 'b.txt'`, [feat]);
    await q(`INSERT INTO files (repo_id, branch_id, path, content) VALUES ($1, $2, 'd.txt', 'new-d')`, [repo, feat]);
    const c2 = await commit(feat, 'feature work');
    expect(c2.parent_id).toBe(c1.id);

    await q(`UPDATE files SET content = 'main-c' WHERE branch_id = $1 AND path = 'c.txt'`, [main]);
    const c3 = await commit(main, 'main work');
    expect((await one(`SELECT merge_base($1, $2) AS b`, [c2.id, c3.id])).b).toBe(c1.id);

    const pr = await openPr(feat);
    await expect(q(`UPDATE pull_requests SET source_branch_id = $2 WHERE id = $1`, [pr, main])).rejects.toThrow(/immutable/);

    const result = await merge(pr);
    expect(result.merged).toBe(true);
    expect(await files(main)).toEqual({ 'a.txt': 'feat-a', 'c.txt': 'main-c', 'd.txt': 'new-d' });

    const snapshot = Object.fromEntries((await q<{ path: string; content: string }>(
      `SELECT t.path, t.content FROM branches b, commit_tree(b.last_commit_id) t WHERE b.id = $1`, [main]
    )).map((r) => [r.path, r.content]));
    expect(snapshot).toEqual(await files(main));

    // The PR diff is computed from hashes in SQL: changes since the merge base
    const diff = await q(`SELECT * FROM diff_commits($1, $2)`, [c2.id, c1.id]);
    expect(diff).toEqual([
      { path: 'a.txt', status: 'modified', content: 'feat-a', original_content: 'base-a' },
      { path: 'b.txt', status: 'deleted', content: null, original_content: 'base-b' },
      { path: 'd.txt', status: 'added', content: 'new-d', original_content: null },
    ]);

    expect((await one(`SELECT status FROM pull_requests WHERE id = $1`, [pr])).status).toBe('merged');
    await expect(merge(pr)).rejects.toThrow(/not open/);
  });

  it('reports conflicts and leaves the PR open', async () => {
    const feat = await branchFrom('feature/y');
    await q(`UPDATE files SET content = 'y-a' WHERE branch_id = $1 AND path = 'a.txt'`, [feat]);
    await commit(feat, 'y');
    await q(`UPDATE files SET content = 'main-a2' WHERE branch_id = $1 AND path = 'a.txt'`, [main]);
    await commit(main, 'main a2');

    const pr = await openPr(feat);
    // The preview reports the conflict without changing anything
    expect((await one(`SELECT merge_pull_request($1, '${A}', true) AS r`, [pr])).r)
      .toEqual({ mergeable: false, conflicts: ['a.txt'], changes: 0 });
    expect(await merge(pr)).toEqual({ merged: false, conflicts: ['a.txt'] });
    expect((await one(`SELECT status FROM pull_requests WHERE id = $1`, [pr])).status).toBe('open');
  });

  it('never overwrites uncommitted edits on the target', async () => {
    const feat = await branchFrom('feature/z');
    await q(`UPDATE files SET content = 'z-c' WHERE branch_id = $1 AND path = 'c.txt'`, [feat]);
    await commit(feat, 'z');
    await q(`UPDATE files SET content = 'unsaved-wip' WHERE branch_id = $1 AND path = 'c.txt'`, [main]);

    expect(await merge(await openPr(feat))).toEqual({ merged: false, conflicts: ['c.txt'] });
    expect((await files(main))['c.txt']).toBe('unsaved-wip');
    await db.exec('RESET ROLE');
  });

  it('previews a clean merge without applying it', async () => {
    await commit(main, 'commit pending work'); // start from a clean target working tree
    const feat = await branchFrom('feature/preview');
    await q(`INSERT INTO files (repo_id, branch_id, path, content) VALUES ($1, $2, 'p.txt', 'preview')`, [repo, feat]);
    await commit(feat, 'preview');
    const pr = await openPr(feat);
    const before = await files(main);

    expect((await one(`SELECT merge_pull_request($1, '${A}', true) AS r`, [pr])).r)
      .toEqual({ mergeable: true, conflicts: [], changes: 1 });
    expect(await files(main)).toEqual(before);
    expect((await one(`SELECT status FROM pull_requests WHERE id = $1`, [pr])).status).toBe('open');
  });

  it('stores each distinct file content once', async () => {
    const blobsBefore = Number((await one(`SELECT count(*) AS n FROM blobs`)).n);
    const rowsBefore = Number((await one(`SELECT count(*) AS n FROM file_snapshots`)).n);
    await commit(main, 'no-op commit 1');
    await commit(main, 'no-op commit 2');
    expect(Number((await one(`SELECT count(*) AS n FROM blobs`)).n)).toBe(blobsBefore);
    expect(Number((await one(`SELECT count(*) AS n FROM file_snapshots`)).n)).toBeGreaterThan(rowsBefore);

    const stats = (await one(`SELECT snapshot_storage_stats() AS s`)).s;
    expect(stats.logical_bytes).toBeGreaterThan(stats.stored_bytes);
  });

  it('migrates legacy inline snapshot content into blobs', async () => {
    const c = await commit(main, 'legacy holder');
    await q(`INSERT INTO file_snapshots (commit_id, repo_id, path, content) VALUES ($1, $2, 'legacy.txt', 'old inline text')`, [c.id, repo]);
    await db.exec(fs.readFileSync(path.join(ROOT, 'migrations/010_content_addressed_snapshots.sql'), 'utf8'));

    const row = await one(`SELECT content, blob_hash FROM file_snapshots WHERE commit_id = $1 AND path = 'legacy.txt'`, [c.id]);
    expect(row.content).toBeNull();
    expect(row.blob_hash).toMatch(/^[0-9a-f]{64}$/);
    const tree = await q(`SELECT content FROM commit_tree($1) WHERE path = 'legacy.txt'`, [c.id]);
    expect(tree).toEqual([{ content: 'old inline text' }]);
  });

  it('never garbage-collects referenced or recently used blobs', async () => {
    await q(`INSERT INTO blobs (hash, content, last_used_at) VALUES (repeat('a', 64), 'orphan', now() - interval '2 days')`);
    await q(`INSERT INTO blobs (hash, content) VALUES (repeat('b', 64), 'fresh orphan')`);
    const referenced = Number((await one(`SELECT count(*) AS n FROM blobs WHERE hash IN (SELECT blob_hash FROM file_snapshots)`)).n);

    expect((await one(`SELECT gc_blobs() AS n`)).n).toBe(1);
    expect(await q(`SELECT hash FROM blobs WHERE hash = repeat('a', 64)`)).toHaveLength(0);
    expect(await q(`SELECT hash FROM blobs WHERE hash = repeat('b', 64)`)).toHaveLength(1);
    expect(Number((await one(`SELECT count(*) AS n FROM blobs WHERE hash IN (SELECT blob_hash FROM file_snapshots)`)).n)).toBe(referenced);
  });

  it('keeps versioning functions service-role only', async () => {
    await expect(asRole(B, () => q(`SELECT create_commit($1, $2, '${B}', 'x')`, [repo, main]))).rejects.toThrow(/permission denied/);
    await expect(asRole(B, () => q(`SELECT merge_base(NULL, NULL)`))).rejects.toThrow(/permission denied/);
    await expect(asRole(B, () => q(`SELECT * FROM diff_commits(NULL, NULL)`))).rejects.toThrow(/permission denied/);
    await expect(asRole(B, () => q(`SELECT * FROM blobs`))).rejects.toThrow(/permission denied/);
  });
});

describe('shared rate limits', () => {
  const hit = async (key: string) => (await one(`SELECT rate_limit_hit($1, 60000) AS r`, [key])).r;

  it('counts hits per key within a window', async () => {
    expect((await hit('auth:k1')).hits).toBe(1);
    expect((await hit('auth:k1')).hits).toBe(2);
    expect((await hit('auth:k2')).hits).toBe(1);

    const r = await hit('auth:k1');
    expect(r.hits).toBe(3);
    expect(new Date(r.reset_at).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('supports decrement and reset', async () => {
    await q(`SELECT rate_limit_decrement('auth:k1', 60000)`);
    expect((await hit('auth:k1')).hits).toBe(3);
    await q(`SELECT rate_limit_reset('auth:k1')`);
    expect((await hit('auth:k1')).hits).toBe(1);
  });

  it('rejects tiny windows and is service-role only', async () => {
    await expect(q(`SELECT rate_limit_hit('x', 10)`)).rejects.toThrow(/at least 1000ms/);
    await expect(asRole(A, () => q(`SELECT rate_limit_hit('x', 60000)`))).rejects.toThrow(/permission denied/);
    await expect(asRole(A, () => q(`SELECT * FROM rate_limits`))).rejects.toThrow(/permission denied/);
  });
});

describe('realtime channel authorization', () => {
  const C = '00000000-0000-0000-0000-00000000000c';
  let repo: string;

  const onTopic = (topic: string) => db.query(`SELECT set_config('realtime.topic', $1, false)`, [topic]);
  const send = (uid: string, extension: 'broadcast' | 'presence') =>
    asRole(uid, () => q(`INSERT INTO realtime.messages (topic, extension, payload) VALUES (realtime.topic(), $1, '{}')`, [extension]));
  const visible = (uid: string) => asRole(uid, () => q(`SELECT id FROM realtime.messages WHERE topic = realtime.topic()`));

  beforeAll(async () => {
    await q(`INSERT INTO auth.users (id, email) VALUES ('${C}', 'c@x.com')`);
    await db.exec('SET ROLE service_role');
    repo = (await one(`INSERT INTO repositories (name, owner_id, is_private) VALUES ('live', '${A}', true) RETURNING id`)).id;
    await db.exec('RESET ROLE');
    await onTopic(`repo:${repo}`);
  });

  it('lets the owner broadcast, track presence and receive', async () => {
    await expect(send(A, 'broadcast')).resolves.toBeDefined();
    await expect(send(A, 'presence')).resolves.toBeDefined();
    expect((await visible(A)).length).toBe(2);
  });

  it('shuts strangers out of private repo channels', async () => {
    await expect(send(C, 'presence')).rejects.toThrow(/row-level security/);
    await expect(send(C, 'broadcast')).rejects.toThrow(/row-level security/);
    expect(await visible(C)).toHaveLength(0);
  });

  it('lets read collaborators listen and show presence, but not broadcast edits', async () => {
    await db.exec('SET ROLE service_role');
    await q(`INSERT INTO repo_collaborators (repo_id, user_id, permission) VALUES ($1, '${C}', 'read')`, [repo]);
    await db.exec('RESET ROLE');

    await expect(send(C, 'presence')).resolves.toBeDefined();
    await expect(send(C, 'broadcast')).rejects.toThrow(/row-level security/);
    expect((await visible(C)).length).toBeGreaterThan(0);
  });

  it('denies malformed topics', async () => {
    await onTopic('repo:not-a-uuid');
    await expect(send(A, 'presence')).rejects.toThrow(/row-level security/);
    await onTopic(`repo:${repo}`);
  });
});

describe('account deletion', () => {
  it('cascades without FK violations', async () => {
    await expect(q(`DELETE FROM auth.users WHERE id = '${B}'`)).resolves.toBeDefined();
  });
});
