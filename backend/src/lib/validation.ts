/** Columns of public.users that are safe to expose (never email/role). */
export const PUBLIC_USER_COLUMNS = 'id, name, avatar_url';

export const MAX_FILE_BYTES = 512 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value);

/** Mirrors repositories_name_format in migration 009. */
export const isValidRepoName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(value) && value !== '.' && value !== '..';

/** Mirrors branches_name_format in migration 009. */
export const isValidBranchName = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9._/-]{1,100}$/.test(value) &&
  !/(^\/|\/$|\/\/|\.\.)/.test(value);

/** Optional string field: undefined/null pass, otherwise must be a string within maxLength. */
export const isOptionalText = (value: unknown, maxLength: number) =>
  value === undefined || value === null || (typeof value === 'string' && value.length <= maxLength);

/** Required non-blank string within maxLength. */
export const isRequiredText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
