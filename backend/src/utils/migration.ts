import { supabaseAdmin } from '../index';
import { GitManager } from './git';
import { logger } from './logger';

/**
 * Port legacy SQL-based repository files to the physical Git engine.
 */
export async function migrateSqlToGit(repoId: string): Promise<boolean> {
  const git = new GitManager(repoId);
  
  if (git.exists()) {
    logger.info(`Repository ${repoId} already exists on disk. Skipping migration.`);
    return true;
  }

  try {
    logger.info(`Starting migration for repository ${repoId} from SQL to Git...`);
    
    // Fetch repository data to get the default branch
    const { data: repo, error: repoError } = await supabaseAdmin
      .from('repositories')
      .select('default_branch')
      .eq('id', repoId)
      .single();

    if (repoError || !repo) {
      logger.error(`Migration failed: Could not fetch repository ${repoId} metadata.`);
      return false;
    }

    // Fetch all files for the default branch
    // Note: In Phase 2, we initially migrate the default branch. 
    // Other branches can be migrated on-demand if accessed, or all at once.
    const { data: files, error: fileError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('repo_id', repoId);
      // We don't filter by branch strictly because we want to populate the initial state.

    if (fileError) {
      logger.error(`Migration failed: Could not fetch files for repository ${repoId}.`);
      return false;
    }

    if (!files || files.length === 0) {
      logger.info(`Repository ${repoId} has no files in SQL. Initializing empty Git repo.`);
      await git.init();
      return true;
    }

    // Initialize repo and write files
    await git.init();
    
    for (const file of files) {
      await git.writeFile(file.path, file.content || '');
    }

    // Final commit from system migration
    await git.commit('Initial migration from DevForge SQL storage');
    
    logger.info(`Successfully migrated repository ${repoId} to Git engine.`);
    return true;
  } catch (err: any) {
    logger.error(`Migration error for repository ${repoId}: ${err.message}`);
    return false;
  }
}
