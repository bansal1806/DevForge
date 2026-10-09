/** Deterministic demo data served by the mocked API (see ./test.ts). */

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const author = (name: string) => ({ id: name, name, avatar_url: null })

export const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'ada@example.com', name: 'Ada Lovelace' }

export const REPO = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'algo-playground', description: 'Classic algorithms with runnable examples — try the Run button!',
  is_private: false, default_branch: 'main', owner_id: USER.id, created_at: ago(60 * 24 * 12), updated_at: ago(3),
  stars_count: 14, starred_by_me: false, permission: 'admin', owner: { id: USER.id, name: USER.name, avatar_url: null },
}

export const REPOS = [
  REPO,
  { ...REPO, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'devforge-notes', description: 'Engineering notes on building DevForge itself.', stars_count: 3, updated_at: ago(60 * 5) },
  { ...REPO, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'secret-sauce', description: 'Private experiments.', is_private: true, stars_count: 0, updated_at: ago(60 * 30) },
  { ...REPO, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'rust-raytracer', description: null, stars_count: 41, updated_at: ago(60 * 24 * 6) },
]

export const MAIN = { id: '00000000-0000-4000-8000-0000000000a1', repo_id: REPO.id, name: 'main', is_default: true, last_commit_id: 'c3', created_at: ago(9000) }
export const FEAT = { id: '00000000-0000-4000-8000-0000000000a2', repo_id: REPO.id, name: 'feature/memoized-fib', is_default: false, last_commit_id: 'c4', created_at: ago(200) }

const FIB = 'def fib(n):\n    if n <= 1:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\n\nif __name__ == "__main__":\n    for i in range(10):\n        print(f"fib({i}) = {fib(i)}")\n'

export const FILES = [
  { id: 'f1', repo_id: REPO.id, branch_id: MAIN.id, path: 'README.md', content: '# algo-playground\n\nClassic algorithms with runnable examples.\n', updated_at: ago(500) },
  { id: 'f2', repo_id: REPO.id, branch_id: MAIN.id, path: 'fibonacci.py', content: FIB, updated_at: ago(30) },
  { id: 'f3', repo_id: REPO.id, branch_id: MAIN.id, path: 'src/quicksort.js', content: 'function quicksort(arr) {\n  if (arr.length <= 1) return arr\n  const [pivot, ...rest] = arr\n  return [...quicksort(rest.filter(x => x < pivot)), pivot, ...quicksort(rest.filter(x => x >= pivot))]\n}\n\nconsole.log(quicksort([5, 3, 8, 1, 9, 2, 7]))\n', updated_at: ago(90) },
  { id: 'f4', repo_id: REPO.id, branch_id: MAIN.id, path: 'src/binary_search.py', content: 'def search(xs, target):\n    lo, hi = 0, len(xs) - 1\n', updated_at: ago(400) },
]

export const COMMITS = [
  { id: 'c3f1a2b3c4d5e6', repo_id: REPO.id, branch_id: MAIN.id, author_id: USER.id, message: 'Tune quicksort pivot selection', created_at: ago(4), parent_id: 'm2', merge_parent_id: null, author: author('Ada Lovelace') },
  { id: 'm2e7d6c5b4a3f2', repo_id: REPO.id, branch_id: MAIN.id, author_id: 'g', message: 'Merge pull request "Add binary search" (feature/search → main)', created_at: ago(120), parent_id: 'c1', merge_parent_id: 'x', author: author('Grace Hopper') },
  { id: 'c1a9b8c7d6e5f4', repo_id: REPO.id, branch_id: MAIN.id, author_id: 'l', message: 'Initial commit: fibonacci and quicksort', created_at: ago(60 * 24 * 11), parent_id: null, merge_parent_id: null, author: author('Linus Torvalds') },
]

export const PRS = [
  { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', repo_id: REPO.id, author_id: USER.id, source_branch_id: FEAT.id, target_branch_id: MAIN.id, title: 'Memoize fibonacci for exponential speedup', description: 'Naive recursion recomputes subproblems. `functools.lru_cache` turns O(2^n) into O(n).', status: 'open', created_at: ago(180), updated_at: ago(60), merged_at: null, author: author('Ada Lovelace'), source: { id: FEAT.id, name: FEAT.name }, target: { id: MAIN.id, name: 'main' }, repo: { id: REPO.id, name: REPO.name } },
  { id: 'eeeeeeee-1111-4111-8111-111111111111', repo_id: REPO.id, author_id: 'g', source_branch_id: FEAT.id, target_branch_id: MAIN.id, title: 'Add binary search example', description: null, status: 'merged', created_at: ago(400), updated_at: ago(120), merged_at: ago(120), author: author('Grace Hopper'), source: { id: 'x', name: 'feature/search' }, target: { id: MAIN.id, name: 'main' }, repo: { id: REPO.id, name: REPO.name } },
]

export const ISSUES = [
  { id: 'iiiiiiii-1111-4111-8111-111111111111', repo_id: REPO.id, author_id: USER.id, title: 'Add a heap sort example', description: 'Would round out the sorting algorithms.', status: 'open', created_at: ago(300), updated_at: ago(300), author: author('Ada Lovelace'), repo: { id: REPO.id, name: REPO.name }, permissions: { canEdit: true } },
  { id: 'iiiiiiii-2222-4222-8222-222222222222', repo_id: REPO.id, author_id: 'l', title: 'quicksort recursion depth on sorted input', description: null, status: 'closed', created_at: ago(3000), updated_at: ago(2000), author: author('Linus Torvalds'), repo: { id: REPO.id, name: REPO.name } },
]

export const ACTIVITY = [
  { id: 'a1', type: 'commit', message: 'Tune quicksort pivot selection', created_at: ago(4), repo_id: REPO.id, repo: { name: REPO.name }, author: { name: 'Ada Lovelace' } },
  { id: 'a2', type: 'pr', title: 'Memoize fibonacci for exponential speedup', created_at: ago(180), repo_id: REPO.id, repo: { name: REPO.name }, author: { name: 'Ada Lovelace' } },
  { id: 'a3', type: 'issue', title: 'Add a heap sort example', created_at: ago(300), repo_id: REPO.id, repo: { name: REPO.name }, author: { name: 'Ada Lovelace' } },
  { id: 'a4', type: 'commit', message: 'Write engineering notes', created_at: ago(60 * 26), repo_id: REPOS[1].id, repo: { name: REPOS[1].name }, author: { name: 'Ada Lovelace' } },
]

export const METRICS = Array.from({ length: 12 }, (_, i) => ({
  language: i % 3 ? 'python' : 'javascript', status: i === 4 ? 'error' : 'success', duration: 300 + i * 90, created_at: ago(60 * (12 - i)),
}))

export const PR_DETAIL = {
  pr: PRS[0],
  diff: {
    'fibonacci.py': {
      status: 'modified',
      originalContent: FIB,
      content: 'from functools import lru_cache\n\n\n@lru_cache(maxsize=None)\n' + FIB.replace('range(10)', 'range(20)'),
    },
  },
  mergePreview: { mergeable: true, conflicts: [], changes: 1 },
  permissions: { canMerge: true, canClose: true },
}

export const PR_ACTIVITY = [
  { id: 'r1', type: 'review', status: 'approved', content: 'Nice speedup — LGTM.', created_at: ago(90), author: author('Grace Hopper') },
  { id: 'k1', type: 'comment', content: 'Could we also bump the demo range to 20?', created_at: ago(70), author: author('Linus Torvalds') },
]

export const GISTS = [
  { id: '99999999-1111-4111-8111-111111111111', user_id: USER.id, title: 'Debounce in 6 lines', description: 'A tiny, dependency-free debounce.', is_public: true, created_at: ago(40), user: author('Ada Lovelace'),
    files: [
      { id: 'gf1', gist_id: 'g1', filename: 'debounce.ts', language: 'typescript', content: 'export function debounce<T extends (...a: never[]) => void>(fn: T, ms = 200) {\n  let t: ReturnType<typeof setTimeout>\n  return (...args: Parameters<T>) => {\n    clearTimeout(t)\n    t = setTimeout(() => fn(...args), ms)\n  }\n}\n' },
      { id: 'gf2', gist_id: 'g1', filename: 'usage.ts', language: 'typescript', content: "const save = debounce(() => console.log('saved'), 300)\n" },
    ] },
  { id: '99999999-2222-4222-8222-222222222222', user_id: 'g', title: 'fizzbuzz.py', description: null, is_public: true, created_at: ago(60 * 30), user: author('Grace Hopper'),
    files: [{ id: 'gf3', gist_id: 'g2', filename: 'fizzbuzz.py', language: 'python', content: 'for i in range(1, 16):\n    print("FizzBuzz" if i % 15 == 0 else i)\n' }] },
  { id: '99999999-3333-4333-8333-333333333333', user_id: USER.id, title: 'Secret notes', description: 'Only mine.', is_public: false, created_at: ago(5), user: author('Ada Lovelace'),
    files: [{ id: 'gf4', gist_id: 'g3', filename: 'notes.md', language: 'markdown', content: '# todo\n- ship forge UI\n' }] },
]

export const AUDIT_LOGS = [
  { id: 'l1', action: 'repo_created', metadata: null, created_at: ago(30), user: { name: 'Ada Lovelace', email: 'ada@example.com' }, repository: { name: 'algo-playground' } },
  { id: 'l2', action: 'collaborator_added', metadata: null, created_at: ago(300), user: { name: 'Grace Hopper', email: null }, repository: { name: 'devforge-notes' } },
  { id: 'l3', action: 'repo_deleted', metadata: null, created_at: ago(3000), user: null, repository: null },
]

export const PLATFORM_STATS = { publicRepositories: 12, commits: 348, mergedPullRequests: 27, developers: 9 }
