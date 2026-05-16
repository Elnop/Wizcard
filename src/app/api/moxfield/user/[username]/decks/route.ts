// src/app/api/moxfield/user/[username]/decks/route.ts
import { NextResponse } from 'next/server';

const MOXFIELD_API = 'https://api.moxfield.com/v2/users';
const PAGE_SIZE = 100;

export type MoxfieldUserDeckEntry = {
	publicId: string;
	name: string;
	format: string | null;
	colorIdentity: string[];
	cardCount: number;
	lastUpdatedAtUtc: string | null;
	folderName: string | null;
};

type MoxfieldUserDecksPage = {
	data: Array<{
		publicId: string;
		name: string;
		format: string | null;
		colorIdentity: string[];
		mainboardCount: number;
		sideboardCount: number;
		commandersCount: number;
		lastUpdatedAtUtc: string | null;
		hub?: { name: string } | null;
	}>;
	pageNumber: number;
	pageSize: number;
	totalResults: number;
};

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
	const { username } = await params;

	if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) {
		return NextResponse.json({ error: 'Invalid username' }, { status: 400 });
	}

	const userAgent = process.env.MOXFIELD_USER_AGENT ?? 'Wizcard/1.0';
	const allDecks: MoxfieldUserDeckEntry[] = [];
	let pageNumber = 1;
	let totalPages = 1;

	while (pageNumber <= totalPages) {
		const url = `${MOXFIELD_API}/${encodeURIComponent(username)}/decks?pageNumber=${pageNumber}&pageSize=${PAGE_SIZE}&sortType=updated&sortDirection=descending`;

		const res = await fetch(url, {
			headers: { 'User-Agent': userAgent, Accept: 'application/json' },
		});

		if (res.status === 404) {
			return NextResponse.json({ error: 'User not found' }, { status: 404 });
		}
		if (res.status === 403) {
			return NextResponse.json({ error: 'Profile is private' }, { status: 403 });
		}
		if (!res.ok) {
			return NextResponse.json({ error: 'Failed to fetch from Moxfield' }, { status: 502 });
		}

		const page = (await res.json()) as MoxfieldUserDecksPage;

		for (const d of page.data) {
			allDecks.push({
				publicId: d.publicId,
				name: d.name,
				format: d.format ?? null,
				colorIdentity: d.colorIdentity ?? [],
				cardCount: (d.mainboardCount ?? 0) + (d.commandersCount ?? 0),
				lastUpdatedAtUtc: d.lastUpdatedAtUtc ?? null,
				folderName: d.hub?.name ?? null,
			});
		}

		totalPages = Math.ceil(page.totalResults / PAGE_SIZE);
		pageNumber++;
	}

	return NextResponse.json({ decks: allDecks });
}
