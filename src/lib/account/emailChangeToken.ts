import 'server-only';
import { createHash, randomBytes } from 'crypto';

/** SHA-256 hex of a token — used both to store and to look up (never store plaintext). */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** A fresh URL-safe token and its hash. The plaintext lives only in the email link. */
export function generateToken(): { token: string; tokenHash: string } {
	const token = randomBytes(32).toString('base64url');
	return { token, tokenHash: hashToken(token) };
}
