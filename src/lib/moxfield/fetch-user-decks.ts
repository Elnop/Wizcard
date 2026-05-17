const MOXFIELD_PROFILE_RE = /^https?:\/\/(?:www\.)?moxfield\.com\/users\/([A-Za-z0-9_-]+)/;

export type MoxfieldUserDeckEntry = {
	publicId: string;
	name: string;
	format: string | null;
	colorIdentity: string[];
	cardCount: number;
	lastUpdatedAtUtc: string | null;
	folderName: string | null;
};

type MoxfieldV3Deck = {
	publicId: string;
	name: string;
	format: string | null;
	colorIdentity: string[];
	mainboardCount: number;
	lastUpdatedAtUtc: string | null;
	folder?: { name: string } | null;
};

type MoxfieldV3DecksResponse = {
	decks: MoxfieldV3Deck[];
};

export function extractMoxfieldUsername(input: string): string | null {
	const trimmed = input.trim();
	const match = MOXFIELD_PROFILE_RE.exec(trimmed);
	if (match) return match[1];
	if (/^[A-Za-z0-9_-]{1,40}$/.test(trimmed)) return trimmed;
	return null;
}

export async function fetchMoxfieldUserDecks(username: string): Promise<MoxfieldUserDeckEntry[]> {
	const res = await fetch(
		`https://api2.moxfield.com/v3/decks?userName=${encodeURIComponent(username)}`,
		{ credentials: 'include' }
	);

	if (res.status === 404) throw new Error('Moxfield user not found.');
	if (res.status === 403) throw new Error('This Moxfield profile is private.');
	if (!res.ok) throw new Error(`Failed to fetch Moxfield profile (${res.status}).`);

	const data = (await res.json()) as MoxfieldV3DecksResponse;

	return data.decks.map((d) => ({
		publicId: d.publicId,
		name: d.name,
		format: d.format ?? null,
		colorIdentity: d.colorIdentity ?? [],
		cardCount: d.mainboardCount ?? 0,
		lastUpdatedAtUtc: d.lastUpdatedAtUtc ?? null,
		folderName: d.folder?.name ?? null,
	}));
}
