import { NextResponse } from 'next/server';

const SCRYFALL_URL = 'https://api.scryfall.com/cards/collection';

export async function POST(req: Request) {
	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const res = await fetch(SCRYFALL_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'User-Agent': 'Wizcard/1.0',
		},
		body: JSON.stringify(body),
	});

	const data = await res.json();

	if (!res.ok) {
		return NextResponse.json(data, { status: res.status });
	}

	return NextResponse.json(data);
}
