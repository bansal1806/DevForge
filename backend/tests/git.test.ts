/**
 * Exercises the on-disk git mirror against a real git binary, so dependency
 * upgrades (e.g. simple-git majors) can't silently break it.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { simpleGit } from 'simple-git';
import { GitManager } from '../src/utils/git';

const git = new GitManager(randomUUID());

afterAll(async () => {
  await git.destroy();
});

describe('GitManager (git mirror)', () => {
  it('rejects ids that are not UUIDs (path safety)', () => {
    expect(() => new GitManager('../../etc')).toThrow(/Invalid repository id/);
  });

  it('initializes, commits with an author, reads back and removes files', async () => {
    await git.init();
    expect(git.exists()).toBe(true);

    await git.writeFile('src/main.py', 'print("hi")\n');
    await git.writeFile('README.md', '# demo\n');
    await git.commit('Initial commit', { name: 'Ada <Lovelace>', email: 'ada@example.com' });

    expect((await git.listFiles()).sort()).toEqual(['README.md', 'src/main.py']);
    expect(await git.getFileContent('src/main.py')).toBe('print("hi")\n');

    const log = await simpleGit(git.getPath()).log();
    expect(log.latest?.message).toBe('Initial commit');
    // Angle brackets are stripped so the author string stays well-formed
    expect(log.latest?.author_name).toBe('Ada Lovelace');
    expect(log.latest?.author_email).toBe('ada@example.com');

    await git.removeFile('README.md');
    await git.commit('Remove README');
    expect(await git.listFiles()).toEqual(['src/main.py']);
  });
});
