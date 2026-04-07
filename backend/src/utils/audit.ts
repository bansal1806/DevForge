import { supabaseAdmin } from '../index'

export interface AuditLogParams {
  userId: string;
  repoId?: string;
  action: string;
  metadata?: any;
}

/**
 * Logs a high-fidelity audit entry for site-wide or repository-specific tracking.
 */
export async function logAudit(params: AuditLogParams) {
  try {
    const { error } = await supabaseAdmin
      .from('audit_logs')
      .insert([{
        user_id: params.userId,
        repo_id: params.repoId,
        action: params.action,
        metadata: params.metadata || {}
      }])

    if (error) {
      console.error('[AUDIT ERROR]', error)
    }
  } catch (err) {
    console.error('[AUDIT FAILED]', err)
  }
}

/**
 * Logs a high-fidelity execution metric entry.
 */
export async function logExecutionMetric(params: {
  repoId: string;
  language: string;
  status: 'success' | 'error' | 'timeout';
  duration: number;
}) {
  try {
    const { error } = await supabaseAdmin
      .from('execution_stats')
      .insert([{
        repo_id: params.repoId,
        language: params.language,
        status: params.status,
        duration: params.duration
      }])

    if (error) {
       console.error('[METRIC ERROR]', error)
    }
  } catch (err) {
    console.error('[METRIC FAILED]', err)
  }
}
