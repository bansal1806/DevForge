import { describe, it, expect, vi } from 'vitest';
import { isSafeRepoPath } from '../src/utils/versioning';
import { blockBots, limitPayloadSize } from '../src/middleware/abuseProtection';

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn(() => res);
  return res;
}

describe('isSafeRepoPath', () => {
  it('accepts normal relative paths', () => {
    expect(isSafeRepoPath('README.md')).toBe(true);
    expect(isSafeRepoPath('src/utils/logger.ts')).toBe(true);
    expect(isSafeRepoPath('a/b/c/d.py')).toBe(true);
  });

  it('rejects path traversal', () => {
    expect(isSafeRepoPath('../secrets.env')).toBe(false);
    expect(isSafeRepoPath('src/../../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('..\\windows\\system32')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isSafeRepoPath('/etc/passwd')).toBe(false);
    expect(isSafeRepoPath('C:/Windows/system.ini')).toBe(false);
    expect(isSafeRepoPath('\\\\share\\file')).toBe(false);
  });

  it('rejects empty and degenerate paths', () => {
    expect(isSafeRepoPath('')).toBe(false);
    expect(isSafeRepoPath('.')).toBe(false);
    expect(isSafeRepoPath('a//b')).toBe(false);
    expect(isSafeRepoPath('x'.repeat(600))).toBe(false);
  });
});

describe('blockBots', () => {
  const makeReq = (ua?: string) => ({ get: () => ua }) as any;

  it('blocks scraper user agents', () => {
    for (const ua of ['curl/8.0', 'python-requests/2.31', 'PostmanRuntime/7.36', 'HeadlessChrome']) {
      const res = mockRes();
      const next = vi.fn();
      blockBots(makeReq(ua), res, next);
      expect(res.statusCode, ua).toBe(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('allows browser user agents', () => {
    const res = mockRes();
    const next = vi.fn();
    blockBots(makeReq('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'), res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe('limitPayloadSize', () => {
  const makeReq = (len: number) => ({ get: () => String(len) }) as any;

  it('rejects payloads over the limit', () => {
    const res = mockRes();
    const next = vi.fn();
    limitPayloadSize(1024)(makeReq(4096), res, next);
    expect(res.statusCode).toBe(413);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes payloads under the limit', () => {
    const res = mockRes();
    const next = vi.fn();
    limitPayloadSize(1024)(makeReq(512), res, next);
    expect(next).toHaveBeenCalled();
  });
});
