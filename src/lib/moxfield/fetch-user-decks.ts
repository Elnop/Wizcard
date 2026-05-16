import type { MoxfieldUserDeckEntry } from '@/app/api/moxfield/user/[username]/decks/route';

export type { MoxfieldUserDeckEntry };

const MOXFIELD_PROFILE_RE = /^https?:\/\/(?:www\.)?moxfield\.com\/users\/([A-Za-z0-9_-]+)/;

export function extractMoxfieldUsername(input: string): string | null {
	const trimmed = input.trim();
	const match = MOXFIELD_PROFILE_RE.exec(trimmed);
	if (match) return match[1];
	if (/^[A-Za-z0-9_-]{1,40}$/.test(trimmed)) return trimmed;
	return null;
}

export async function fetchMoxfieldUserDecks(username: string): Promise<MoxfieldUserDeckEntry[]> {
	const res = await fetch(`/api/moxfield/user/${encodeURIComponent(username)}/decks`);

	if (res.status === 404) throw new Error('Moxfield user not found.');
	if (res.status === 403) throw new Error('This Moxfield profile is private.');
	if (!res.ok) throw new Error(`Failed to fetch Moxfield profile (${res.status}).`);

	const data = (await res.json()) as { decks: MoxfieldUserDeckEntry[] };
	return data.decks;
}
