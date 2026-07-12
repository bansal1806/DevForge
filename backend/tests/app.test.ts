import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';

describe('API surface', () => {
  it('serves the health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('DevForge API');
  });

  it('serves the health check even to curl-like user agents (monitoring exemption)', async () => {
    const res = await request(app).get('/api/health').set('User-Agent', 'curl/8.4.0');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Route not found');
  });

  it('blocks bot-like user agents on protected API paths', async () => {
    const res = await request(app).get('/api/repos').set('User-Agent', 'python-requests/2.31');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Automated scripts/);
  });

  it('requires authentication for repository listing', async () => {
    const res = await request(app).get('/api/repos');
    expect(res.status).toBe(401);
  });

  it('requires authentication for commits, file writes, and execution', async () => {
    const endpoints = [
      ['post', '/api/repos/some-id/files'],
      ['post', '/api/repos/some-id/commits'],
      ['post', '/api/execute/some-id/run'],
      ['post', '/api/pull-requests/some-id/merge'],
    ] as const;

    for (const [method, url] of endpoints) {
      const res = await request(app)[method](url).send({});
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(401);
    }
  });

  it('requires authentication for admin endpoints', async () => {
    const res = await request(app).get('/api/admin/metrics');
    expect(res.status).toBe(401);
  });
});
