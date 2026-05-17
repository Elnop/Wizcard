import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MOXFIELD_API = 'https://api2.moxfield.com/v3/decks';

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

export async function GET(req: NextRequest) {
	const username = req.nextUrl.searchParams.get('userName');

	if (!username || !/^[A-Za-z0-9_-]{1,40}$/.test(username)) {
		return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
	}

	const cookie = req.headers.get('cookie') ?? '';

	const res = await fetch(`${MOXFIELD_API}?userName=${encodeURIComponent(username)}`, {
		headers: {
			Accept: 'application/json',
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
			Cookie: cookie,
			Referer: 'https://moxfield.com/',
			Origin: 'https://moxfield.com',
		},
	});

	if (res.status === 401 || res.status === 403) {
		return NextResponse.json(
			{ error: 'Access denied — make sure you are logged in to Moxfield.' },
			{ status: 403 }
		);
	}
	if (res.status === 404) {
		return NextResponse.json({ error: 'User not found' }, { status: 404 });
	}
	if (!res.ok) {
		return NextResponse.json({ error: 'Failed to fetch from Moxfield' }, { status: 502 });
	}

	const data = (await res.json()) as MoxfieldV3DecksResponse;

	const decks: MoxfieldUserDeckEntry[] = (data.decks ?? []).map((d) => ({
		publicId: d.publicId,
		name: d.name,
		format: d.format ?? null,
		colorIdentity: d.colorIdentity ?? [],
		cardCount: d.mainboardCount ?? 0,
		lastUpdatedAtUtc: d.lastUpdatedAtUtc ?? null,
		folderName: d.folder?.name ?? null,
	}));

	return NextResponse.json({ decks });
}
