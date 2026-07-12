/**
 * DevForge demo data seeder.
 *
 * Creates the shared demo account plus a couple of showcase repositories with
 * real branches, commits, snapshots, an open (diffable) pull request, an
 * issue, and a gist — so a first-time visitor lands on a living platform.
 *
 * Idempotent: safe to run multiple times.
 *
 * Usage:  npm run seed   (from backend/, requires .env with SUPABASE_* keys)
 */
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (backend/.env).');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo@devforge.example.com';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'devforge-demo-2026!';

async function ensureDemoUser(): Promise<string> {
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Demo Explorer' },
  });

  if (!error && created.user) {
    console.log(`Created demo user ${DEMO_EMAIL}`);
    return created.user.id;
  }

  // Already exists — look it up
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users.find((u) => u.email === DEMO_EMAIL);
  if (!existing) throw new Error(`Could not create or find demo user: ${error?.message}`);
  console.log(`Demo user already exists (${DEMO_EMAIL})`);
  return existing.id;
}

async function commitBranch(repoId: string, branchId: string, authorId: string, message: string) {
  const { data: commit, error } = await supabase
    .from('commits')
    .insert({ repo_id: repoId, branch_id: branchId, author_id: authorId, message })
    .select()
    .single();
  if (error || !commit) throw new Error(`commit failed: ${error?.message}`);

  const { data: files } = await supabase
    .from('files')
    .select('path, content')
    .eq('repo_id', repoId)
    .eq('branch_id', branchId);

  if (files && files.length > 0) {
    await supabase.from('file_snapshots').insert(
      files.map((f) => ({ commit_id: commit.id, repo_id: repoId, path: f.path, content: f.content }))
    );
  }
  await supabase.from('branches').update({ last_commit_id: commit.id }).eq('id', branchId);
  return commit;
}

async function upsertFile(repoId: string, branchId: string, filePath: string, content: string) {
  const { error } = await supabase.from('files').upsert(
    { repo_id: repoId, branch_id: branchId, path: filePath, content, updated_at: new Date().toISOString() },
    { onConflict: 'repo_id,branch_id,path' }
  );
  if (error) throw new Error(`file upsert failed (${filePath}): ${error.message}`);
}

async function seed() {
  const userId = await ensureDemoUser();

  // ---- Repo 1: algo-playground (with an open, diffable PR) ----
  const repoName = 'algo-playground';
  const { data: existingRepo } = await supabase
    .from('repositories')
    .select('id')
    .eq('owner_id', userId)
    .eq('name', repoName)
    .maybeSingle();

  if (existingRepo) {
    console.log(`Repo ${repoName} already seeded — skipping.`);
  } else {
    const { data: repo, error: repoError } = await supabase
      .from('repositories')
      .insert({
        name: repoName,
        description: 'Classic algorithms with runnable examples — try the Run button!',
        owner_id: userId,
        is_private: false,
        default_branch: 'main',
      })
      .select()
      .single();
    if (repoError || !repo) throw new Error(`repo insert failed: ${repoError?.message}`);

    const { data: main } = await supabase
      .from('branches')
      .insert({ repo_id: repo.id, name: 'main', is_default: true })
      .select()
      .single();
    if (!main) throw new Error('main branch insert failed');

    await upsertFile(repo.id, main.id, 'README.md',
      `# algo-playground\n\nClassic algorithms with runnable examples.\n\nOpen \`fibonacci.py\` or \`quicksort.js\` and hit **Run** to execute them in an isolated sandbox.\n`);
    await upsertFile(repo.id, main.id, 'fibonacci.py',
      `def fib(n):\n    if n <= 1:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\n\nif __name__ == "__main__":\n    for i in range(10):\n        print(f"fib({i}) = {fib(i)}")\n`);
    await upsertFile(repo.id, main.id, 'quicksort.js',
      `function quicksort(arr) {\n  if (arr.length <= 1) return arr;\n  const [pivot, ...rest] = arr;\n  const left = rest.filter(x => x < pivot);\n  const right = rest.filter(x => x >= pivot);\n  return [...quicksort(left), pivot, ...quicksort(right)];\n}\n\nconsole.log(quicksort([5, 3, 8, 1, 9, 2, 7]));\n`);
    await commitBranch(repo.id, main.id, userId, 'Initial commit: fibonacci and quicksort');

    // Feature branch with an improvement — powers a real PR diff
    const { data: feature } = await supabase
      .from('branches')
      .insert({ repo_id: repo.id, name: 'feature/memoized-fib', last_commit_id: main.last_commit_id })
      .select()
      .single();
    if (!feature) throw new Error('feature branch insert failed');

    const { data: mainFiles } = await supabase
      .from('files')
      .select('path, content')
      .eq('repo_id', repo.id)
      .eq('branch_id', main.id);
    for (const f of mainFiles || []) {
      await upsertFile(repo.id, feature.id, f.path, f.content || '');
    }

    await upsertFile(repo.id, feature.id, 'fibonacci.py',
      `from functools import lru_cache\n\n\n@lru_cache(maxsize=None)\ndef fib(n):\n    if n <= 1:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\n\nif __name__ == "__main__":\n    for i in range(20):\n        print(f"fib({i}) = {fib(i)}")\n`);
    await commitBranch(repo.id, feature.id, userId, 'Memoize fibonacci with lru_cache');

    await supabase.from('pull_requests').insert({
      repo_id: repo.id,
      author_id: userId,
      source_branch_id: feature.id,
      target_branch_id: main.id,
      title: 'Memoize fibonacci for exponential speedup',
      description: 'Naive recursion recomputes subproblems. `functools.lru_cache` turns O(2^n) into O(n).\n\nTry the **AI Review** button on this PR!',
      status: 'open',
    });

    await supabase.from('issues').insert({
      repo_id: repo.id,
      author_id: userId,
      title: 'Add binary search example',
      description: 'A `binary_search.py` with an iterative implementation would round out the basics.',
      status: 'open',
    });

    // A few execution stats so the Insights charts have data
    const now = Date.now();
    await supabase.from('execution_stats').insert(
      [0, 1, 2, 3, 4].map((i) => ({
        repo_id: repo.id,
        language: i % 2 === 0 ? 'python' : 'javascript',
        status: i === 3 ? 'error' : 'success',
        duration: 320 + i * 180,
        created_at: new Date(now - i * 86400000).toISOString(),
      }))
    );

    console.log(`Seeded repo ${repoName} with branches, commits, an open PR, and an issue.`);
  }

  // ---- Repo 2: devforge-notes (simple, second explore entry) ----
  const notesName = 'devforge-notes';
  const { data: existingNotes } = await supabase
    .from('repositories')
    .select('id')
    .eq('owner_id', userId)
    .eq('name', notesName)
    .maybeSingle();

  if (!existingNotes) {
    const { data: repo } = await supabase
      .from('repositories')
      .insert({
        name: notesName,
        description: 'Engineering notes on building DevForge itself.',
        owner_id: userId,
        is_private: false,
        default_branch: 'main',
      })
      .select()
      .single();

    if (repo) {
      const { data: main } = await supabase
        .from('branches')
        .insert({ repo_id: repo.id, name: 'main', is_default: true })
        .select()
        .single();
      if (main) {
        await upsertFile(repo.id, main.id, 'README.md',
          `# devforge-notes\n\nEngineering notes on building DevForge itself.\n`);
        await upsertFile(repo.id, main.id, 'architecture.md',
          `# Architecture\n\n- Supabase Postgres is the source of truth for files, branches, commits, and snapshots.\n- PR diffs compare the snapshot sets of the two branch head commits.\n- Code execution runs in a network-isolated Docker sandbox locally, or the Piston API in the cloud.\n`);
        await commitBranch(repo.id, main.id, userId, 'Initial commit: architecture notes');
      }
      console.log(`Seeded repo ${notesName}.`);
    }
  } else {
    console.log(`Repo ${notesName} already seeded — skipping.`);
  }

  // ---- Gist ----
  const { data: existingGist } = await supabase
    .from('gists')
    .select('id')
    .eq('user_id', userId)
    .eq('title', 'Debounce helper')
    .maybeSingle();

  if (!existingGist) {
    const { data: gist } = await supabase
      .from('gists')
      .insert({
        user_id: userId,
        title: 'Debounce helper',
        description: 'A tiny debounce utility in TypeScript.',
        is_public: true,
      })
      .select()
      .single();
    if (gist) {
      await supabase.from('gist_files').insert({
        gist_id: gist.id,
        filename: 'debounce.ts',
        language: 'typescript',
        content:
          `export function debounce<T extends (...args: any[]) => void>(fn: T, ms = 300) {\n  let timer: ReturnType<typeof setTimeout>;\n  return (...args: Parameters<T>) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), ms);\n  };\n}\n`,
      });
      console.log('Seeded demo gist.');
    }
  } else {
    console.log('Demo gist already seeded — skipping.');
  }

  console.log('\nDone. Log in with the "Explore with Demo Account" button, or:');
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
