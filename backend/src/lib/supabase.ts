import './env';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  logger.error('⚠️  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is missing. Check your .env file!');
}

// Placeholder fallbacks keep module load (and the test suite) from crashing
// when env vars are absent; real requests will fail loudly instead.
const url = supabaseUrl || 'http://supabase-not-configured.localhost';

// Server-side clients must never hold a session: supabase-js sends
// `session.access_token ?? apiKey`, so a stored session would silently
// replace the service-role key for every later request on this instance.
const statelessAuth = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * Service-role client: bypasses RLS. Only use it after the route has
 * authorized the caller. Never call auth.signIn* / signUp on it.
 */
export const supabaseAdmin: SupabaseClient = createClient(url, serviceRoleKey || 'missing-service-role-key', {
  auth: statelessAuth,
});

/**
 * Fresh anon client for a single sign-in / sign-up call, so the resulting
 * session can never leak into another request.
 */
export function createAuthClient(): SupabaseClient {
  return createClient(url, anonKey || 'missing-anon-key', { auth: statelessAuth });
}

/**
 * Client that acts as the end user (RLS enforced) by forwarding their JWT.
 */
export function createUserScopedClient(token: string): SupabaseClient {
  return createClient(url, anonKey || 'missing-anon-key', {
    auth: statelessAuth,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
