/**
 * API-level authorization and regression tests. Supabase is replaced by an
 * in-memory fake so the real routes and middleware run end to end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { FakeDb, createFakeClient } from './fakeSupabase';

const OWNER = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@x.com' };
const WRITER = { id: '22222222-2222-4222-8222-222222222222', email: 'writer@x.com' };
const STRANGER = { id: '33333333-3333-4333-8333-333333333333', email: 'stranger@x.com' };
const DEMO = { id: '44444444-4444-4444-8444-444444444444', email: 'demo@devforge.example.com' };

const tokens = { owner: OWNER, writer: WRITER, stranger: STRANGER, demo: DEMO };

const mocks = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  adminSignIn: vi.fn(),
  authClientSignIn: vi.fn(),
}));

vi.mock('../src/lib/supabase', () => {
  const proxy = (pick: () => any) => new Proxy({}, { get: (_t, prop) => pick()[prop] });
  return {
    // Resolved lazily so each test gets a fresh database
    supabaseAdmin: proxy(() => {
      const client = createFakeClient(mocks.db, tokens);
      return { ...client, auth: { ...client.auth, signInWithPassword: mocks.adminSignIn } };
    }),
    createUserScopedClient: () => createFakeClient(mocks.db, tokens),
    createAuthClient: () => ({ auth: { signInWithPassword: mocks.authClientSignIn, signUp: vi.fn() } }),
  };
});

const { default: app } = await import('../src/index');

const ids = {
  publicRepo: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  privateRepo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  otherRepo: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  pubMain: 'aaaaaaaa-0000-4000-8000-000000000001',
  pubFeat: 'aaaaaaaa-0000-4000-8000-000000000002',
  privMain: 'bbbbbbbb-0000-4000-8000-000000000001',
  otherMain: 'cccccccc-0000-4000-8000-000000000001',
  privatePr: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  privateGist: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  privateIssue: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};

const as = (token: keyof typeof tokens) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  mocks.adminSignIn.mockReset();
  mocks.authClientSignIn.mockReset();
  mocks.db = new FakeDb()
    .seed('repositories', [
      { id: ids.publicRepo, name: 'open', owner_id: OWNER.id, is_private: false },
      { id: ids.privateRepo, name: 'secret', owner_id: OWNER.id, is_private: true },
      { id: ids.otherRepo, name: 'other', owner_id: STRANGER.id, is_private: true },
    ])
    .seed('branches', [
      { id: ids.pubMain, repo_id: ids.publicRepo, name: 'main', is_default: true, last_commit_id: null },
      { id: ids.pubFeat, repo_id: ids.publicRepo, name: 'feat', is_default: false, last_commit_id: null },
      { id: ids.privMain, repo_id: ids.privateRepo, name: 'main', is_default: true, last_commit_id: null },
      { id: ids.otherMain, repo_id: ids.otherRepo, name: 'main', is_default: true, last_commit_id: null },
    ])
    .seed('repo_collaborators', [{ repo_id: ids.publicRepo, user_id: WRITER.id, permission: 'write' }])
    .seed('pull_requests', [{
      id: ids.privatePr, repo_id: ids.privateRepo, author_id: OWNER.id, status: 'open',
      source_branch_id: ids.privMain, target_branch_id: ids.privMain, title: 'secret pr',
    }])
    .seed('pr_comments', [{ pr_id: ids.privatePr, author_id: OWNER.id, content: 'private discussion' }])
    .seed('issues', [{ id: ids.privateIssue, repo_id: ids.privateRepo, author_id: OWNER.id, title: 'private', status: 'open' }])
    .seed('issue_comments', [{ issue_id: ids.privateIssue, author_id: OWNER.id, content: 'private comment' }])
    .seed('gists', [{ id: ids.privateGist, user_id: OWNER.id, is_public: false, title: 'mine', files: [] }]);
});

describe('auth', () => {
  it('signs in on a per-request client, never on the shared service-role client', async () => {
    mocks.authClientSignIn.mockResolvedValue({
      data: { session: { access_token: 't', refresh_token: 'r', expires_at: 1 }, user: { id: OWNER.id, email: OWNER.email } },
      error: null,
    });

    const res = await request(app).post('/api/auth/login').send({ email: OWNER.email, password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.session).toEqual({ access_token: 't', refresh_token: 'r', expires_at: 1 });
    expect(mocks.authClientSignIn).toHaveBeenCalledOnce();
    expect(mocks.adminSignIn).not.toHaveBeenCalled();
  });

  it('rejects weak signup input before calling Supabase', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'x@y.com', password: 'short' });
    expect(res.status).toBe(400);
  });
});

describe('repositories', () => {
  it('hides private repos from anonymous visitors and strangers', async () => {
    expect((await request(app).get(`/api/repos/${ids.privateRepo}`)).status).toBe(404);
    expect((await request(app).get(`/api/repos/${ids.privateRepo}`).set(as('stranger'))).status).toBe(404);
  });

  it("reports the caller's effective permission", async () => {
    const owner = await request(app).get(`/api/repos/${ids.publicRepo}`).set(as('owner'));
    const writer = await request(app).get(`/api/repos/${ids.publicRepo}`).set(as('writer'));
    const anon = await request(app).get(`/api/repos/${ids.publicRepo}`);
    expect([owner.body.permission, writer.body.permission, anon.body.permission]).toEqual(['admin', 'write', null]);
  });

  it('blocks destructive actions for the shared demo account', async () => {
    mocks.db.seed('repositories', [{ id: '99999999-9999-4999-8999-999999999999', name: 'demo', owner_id: DEMO.id, is_private: false }]);
    const res = await request(app).delete('/api/repos/99999999-9999-4999-8999-999999999999').set(as('demo'));
    expect(res.status).toBe(403);
    expect(mocks.db.table('repositories').some((r) => r.name === 'demo')).toBe(true);
  });

  it('validates repository and branch names', async () => {
    expect((await request(app).post('/api/repos').set(as('owner')).send({ name: '../evil' })).status).toBe(400);
    expect((await request(app).post(`/api/repos/${ids.publicRepo}/branches`).set(as('owner')).send({ name: 'a//b' })).status).toBe(400);
  });

  it('refuses to create a branch from a missing source branch', async () => {
    const res = await request(app)
      .post(`/api/repos/${ids.publicRepo}/branches`)
      .set(as('owner'))
      .send({ name: 'feature/new', fromBranchId: ids.otherMain });
    expect(res.status).toBe(400);
  });
});

describe('pull requests', () => {
  it('creates a PR with repoId in the body (regression: always 400 before)', async () => {
    const res = await request(app).post('/api/pull-requests').set(as('writer')).send({
      repoId: ids.publicRepo, sourceBranchId: ids.pubFeat, targetBranchId: ids.pubMain, title: 'Add feature',
    });
    expect(res.status).toBe(201);
    expect(res.body.author_id).toBe(WRITER.id);
  });

  it("rejects branches from another repository (private diff exfiltration)", async () => {
    const res = await request(app).post('/api/pull-requests').set(as('owner')).send({
      repoId: ids.publicRepo, sourceBranchId: ids.otherMain, targetBranchId: ids.pubMain, title: 'sneaky',
    });
    expect(res.status).toBe(400);
  });

  it('requires write access to open a PR', async () => {
    const res = await request(app).post('/api/pull-requests').set(as('stranger')).send({
      repoId: ids.publicRepo, sourceBranchId: ids.pubFeat, targetBranchId: ids.pubMain, title: 'drive-by',
    });
    expect(res.status).toBe(403);
  });

  it('hides private PR discussion from anonymous visitors and strangers', async () => {
    expect((await request(app).get(`/api/pull-requests/${ids.privatePr}/activity`)).status).toBe(404);
    expect((await request(app).get(`/api/pull-requests/${ids.privatePr}/activity`).set(as('stranger'))).status).toBe(404);
    const owner = await request(app).get(`/api/pull-requests/${ids.privatePr}/activity`).set(as('owner'));
    expect(owner.status).toBe(200);
    expect(owner.body[0].content).toBe('private discussion');
  });

  it('only lets repo admins merge, and surfaces conflicts as 409', async () => {
    const created = await request(app).post('/api/pull-requests').set(as('writer')).send({
      repoId: ids.publicRepo, sourceBranchId: ids.pubFeat, targetBranchId: ids.pubMain, title: 'conflicting',
    });

    expect((await request(app).post(`/api/pull-requests/${created.body.id}/merge`).set(as('writer'))).status).toBe(403);

    mocks.db.rpcHandlers.merge_pull_request = () => ({ merged: false, conflicts: ['a.txt'] });
    const res = await request(app).post(`/api/pull-requests/${created.body.id}/merge`).set(as('owner'));
    expect(res.status).toBe(409);
    expect(res.body.conflicts).toEqual(['a.txt']);
  });
});

describe('history and merge preview', () => {
  const commitId = '12121212-1212-4121-8121-121212121212';

  beforeEach(() => {
    mocks.db.seed('commits', [{ id: commitId, repo_id: ids.privateRepo, branch_id: ids.privMain, parent_id: null, message: 'init' }]);
    mocks.db.rpcHandlers.diff_commits = () => [{ path: 'a.txt', status: 'added', content: 'hi', original_content: null }];
    mocks.db.rpcHandlers.merge_pull_request = (args) =>
      args.p_dry_run ? { mergeable: true, conflicts: [], changes: 1 } : { merged: true, commit_id: 'x' };
  });

  it('serves commit diffs to readers only', async () => {
    expect((await request(app).get(`/api/repos/${ids.privateRepo}/commits/${commitId}`)).status).toBe(404);
    expect((await request(app).get(`/api/repos/${ids.privateRepo}/commits/${commitId}`).set(as('stranger'))).status).toBe(404);

    const res = await request(app).get(`/api/repos/${ids.privateRepo}/commits/${commitId}`).set(as('owner'));
    expect(res.status).toBe(200);
    expect(res.body.diff).toEqual({ 'a.txt': { status: 'added', content: 'hi', originalContent: null } });
  });

  it('does not serve a commit through another repository', async () => {
    const res = await request(app).get(`/api/repos/${ids.publicRepo}/commits/${commitId}`);
    expect(res.status).toBe(404);
  });

  it('includes a dry-run merge preview on open PRs', async () => {
    const res = await request(app).get(`/api/pull-requests/${ids.privatePr}`).set(as('owner'));
    expect(res.status).toBe(200);
    expect(res.body.mergePreview).toEqual({ mergeable: true, conflicts: [], changes: 1 });
  });
});

describe('issues and gists', () => {
  it('lists issues of a public repo anonymously (regression: always 500 before)', async () => {
    const res = await request(app).get(`/api/issues/repos/${ids.publicRepo}`);
    expect(res.status).toBe(200);
  });

  it('lets owners open their private issues; hides them and their comments from others', async () => {
    expect((await request(app).get(`/api/issues/${ids.privateIssue}`).set(as('owner'))).status).toBe(200);
    expect((await request(app).get(`/api/issues/${ids.privateIssue}`)).status).toBe(404);
    expect((await request(app).get(`/api/issues/${ids.privateIssue}/comments`)).status).toBe(404);
  });

  it('lets owners open their private gists; hides them from others', async () => {
    expect((await request(app).get(`/api/gists/${ids.privateGist}`).set(as('owner'))).status).toBe(200);
    expect((await request(app).get(`/api/gists/${ids.privateGist}`).set(as('stranger'))).status).toBe(404);
  });

  it('rejects gists without files', async () => {
    const res = await request(app).post('/api/gists').set(as('owner')).send({ title: 'empty', is_public: true, files: [] });
    expect(res.status).toBe(400);
    expect(mocks.db.table('gists')).toHaveLength(1);
  });
});

describe('public stats', () => {
  it('returns real aggregate counts without counting private repositories', async () => {
    const { resetStatsCache } = await import('../src/routes/stats');
    resetStatsCache();
    mocks.db.seed('pull_requests', [{ repo_id: ids.publicRepo, status: 'merged' }]);
    mocks.db.seed('users', [{ name: 'a' }, { name: 'b' }]);

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    // seeded: 1 public + 2 private repos, 0 commits, 1 merged PR, 2 users
    expect(res.body).toEqual({ publicRepositories: 1, commits: 0, mergedPullRequests: 1, developers: 2 });
    expect(res.headers['cache-control']).toContain('max-age=300');
  });
});

describe('HTTP hygiene', () => {
  it('returns 413 for oversized JSON bodies and 400 for malformed JSON', async () => {
    // The server rejects on Content-Length before reading the body, so the
    // socket may close while the client is still uploading: either outcome
    // means the oversized request was refused.
    const big = await request(app).post('/api/repos').set(as('owner')).set('Content-Type', 'application/json')
      .send(`{"name":"${'x'.repeat(1_100_000)}"}`)
      .then((res) => res.status, (err) => err.code);
    expect([413, 'ECONNRESET', 'EPIPE']).toContain(big);
    const bad = await request(app).post('/api/repos').set(as('owner')).set('Content-Type', 'application/json').send('{bad json');
    expect(bad.status).toBe(400);
  });

  it('answers disallowed origins with 403 instead of a 500', async () => {
    const res = await request(app).get('/api/repos/explore').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
});
