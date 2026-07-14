/**
 * Single source of truth for profile field validation. Shared by the settings
 * form (UI messages) and mirrored by the DB CHECK constraint (ultimate backstop).
 * Nicknames are URL identifiers (/users/<nickname>), so the charset is deliberately
 * URL-safe. Casing is preserved for display; uniqueness is case-insensitive (DB index).
 */

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 30;
export const DESCRIPTION_MAX = 500;

/** Reserved words that would collide with routes or impersonate the site. */
export const RESERVED_NICKNAMES: ReadonlySet<string> = new Set([
	'admin',
	'api',
	'settings',
	'login',
	'logout',
	'signup',
	'users',
	'wizard',
	'null',
	'undefined',
]);

/** Unicode letters/digits + dot, underscore, hyphen, space. */
export const NICKNAME_CHARSET = /^[\p{L}\p{N}. _-]+$/u;

export type NicknameErrorCode = 'tooShort' | 'tooLong' | 'invalidChars' | 'reserved';
export type NicknameValidation = { ok: true } | { ok: false; code: NicknameErrorCode };

/** Trim and collapse internal whitespace runs to a single space. */
export function normalizeNickname(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Validate an ALREADY-normalized nickname. Does not check uniqueness (async, DB) —
 * that is the caller's job via isNicknameTaken.
 */
export function validateNickname(normalized: string): NicknameValidation {
	if (normalized.length < NICKNAME_MIN) return { ok: false, code: 'tooShort' };
	if (normalized.length > NICKNAME_MAX) return { ok: false, code: 'tooLong' };
	if (!NICKNAME_CHARSET.test(normalized)) return { ok: false, code: 'invalidChars' };
	if (RESERVED_NICKNAMES.has(normalized.toLowerCase())) return { ok: false, code: 'reserved' };
	return { ok: true };
}
