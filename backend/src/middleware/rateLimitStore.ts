import { createHash } from 'crypto';
import type { Options, Store, IncrementResponse } from 'express-rate-limit';
import { supabaseAdmin } from '../lib/supabase';
import { logger } from '../utils/logger';

/**
 * express-rate-limit store backed by Postgres (migration 011), so limits are
 * shared across serverless instances instead of resetting per instance.
 * Client keys (usually IPs) are hashed before they leave the process.
 *
 * Pair with `passOnStoreError: true`: if the database is unreachable the
 * limiter lets requests through rather than taking the API down.
 */
export class PostgresRateLimitStore implements Store {
  windowMs = 60_000;
  localKeys = false;

  constructor(public prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private key(clientKey: string) {
    const digest = createHash('sha256').update(clientKey).digest('hex').slice(0, 32);
    return `${this.prefix}:${digest}`;
  }

  async increment(clientKey: string): Promise<IncrementResponse> {
    const { data, error } = await supabaseAdmin.rpc('rate_limit_hit', {
      p_key: this.key(clientKey),
      p_window_ms: this.windowMs,
    });
    if (error || !data) {
      logger.warn(`Rate limit store unavailable (${this.prefix}): ${error?.message || 'no data'}`);
      throw new Error('Rate limit store unavailable');
    }
    return { totalHits: data.hits, resetTime: new Date(data.reset_at) };
  }

  async decrement(clientKey: string) {
    await supabaseAdmin.rpc('rate_limit_decrement', { p_key: this.key(clientKey), p_window_ms: this.windowMs });
  }

  async resetKey(clientKey: string) {
    await supabaseAdmin.rpc('rate_limit_reset', { p_key: this.key(clientKey) });
  }
}
