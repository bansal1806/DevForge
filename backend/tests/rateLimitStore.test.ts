import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../src/lib/supabase', () => ({ supabaseAdmin: { rpc } }));

const { PostgresRateLimitStore } = await import('../src/middleware/rateLimitStore');

describe('PostgresRateLimitStore', () => {
  beforeEach(() => rpc.mockReset());

  it('hashes client keys and maps the counter response', async () => {
    rpc.mockResolvedValue({ data: { hits: 3, reset_at: '2026-01-01T00:01:00Z' }, error: null });
    const store = new PostgresRateLimitStore('auth');
    store.init({ windowMs: 900_000 } as any);

    const result = await store.increment('203.0.113.7');

    expect(result).toEqual({ totalHits: 3, resetTime: new Date('2026-01-01T00:01:00Z') });
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('rate_limit_hit');
    expect(args.p_window_ms).toBe(900_000);
    expect(args.p_key).toMatch(/^auth:[0-9a-f]{32}$/);
    expect(args.p_key).not.toContain('203.0.113.7');
  });

  it('throws on database errors so passOnStoreError can fail open', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    await expect(new PostgresRateLimitStore('ai').increment('1.2.3.4')).rejects.toThrow(/unavailable/);
  });

  it('keeps limiter namespaces separate', async () => {
    rpc.mockResolvedValue({ data: { hits: 1, reset_at: '2026-01-01T00:01:00Z' }, error: null });
    await new PostgresRateLimitStore('auth').increment('same-ip');
    await new PostgresRateLimitStore('ai').increment('same-ip');
    const [a, b] = rpc.mock.calls.map((c) => c[1].p_key);
    expect(a.split(':')[1]).toBe(b.split(':')[1]);
    expect(a).not.toBe(b);
  });
});

describe('limiter wiring', () => {
  it('fails open when the store is down, and enforces limits when it is up', async () => {
    const express = (await import('express')).default;
    const request = (await import('supertest')).default;
    const { rateLimit } = await import('express-rate-limit');

    const app = express();
    app.use(rateLimit({ windowMs: 60_000, limit: 1, store: new PostgresRateLimitStore('t'), passOnStoreError: true }));
    app.get('/', (_req, res) => { res.send('ok'); });

    rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/')).status).toBe(200);

    rpc.mockResolvedValue({ data: { hits: 2, reset_at: new Date(Date.now() + 60_000).toISOString() }, error: null });
    expect((await request(app).get('/')).status).toBe(429);
  });
});
