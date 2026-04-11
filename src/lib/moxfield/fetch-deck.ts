export type MoxfieldCard = {
	scryfall_id: string;
	name: string;
	set: string;
	cn: string;
};

export type MoxfieldEntry = {
	quantity: number;
	card: MoxfieldCard;
};

export type MoxfieldDeckResponse = {
	id: string;
	name: string;
	format: string;
	description: string;
	publicId: string;
	mainboard: Record<string, MoxfieldEntry>;
	sideboard: Record<string, MoxfieldEntry>;
	commanders: Record<string, MoxfieldEntry>;
	companions: Record<string, MoxfieldEntry>;
	maybeboard: Record<string, MoxfieldEntry>;
};

const MOXFIELD_URL_RE = /^https?:\/\/(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]+)/;

export function extractMoxfieldId(input: string): string | null {
	const trimmed = input.trim();
	const match = MOXFIELD_URL_RE.exec(trimmed);
	if (match) return match[1];
	// Accept a bare ID (no slashes, reasonable length)
	if (/^[A-Za-z0-9_-]{10,30}$/.test(trimmed)) return trimmed;
	return null;
}

export async function fetchMoxfieldDeck(publicId: string): Promise<MoxfieldDeckResponse> {
	const url = `/api/moxfield/deck/${encodeURIComponent(publicId)}`;

	const res = await fetch(url);

	if (res.status === 404) {
		throw new Error('Deck not found — it may be private or the link is invalid.');
	}
	if (res.status === 403) {
		throw new Error('Access denied — this deck may be private.');
	}
	if (!res.ok) {
		throw new Error(`Moxfield API error (${res.status})`);
	}

	return res.json() as Promise<MoxfieldDeckResponse>;
}
