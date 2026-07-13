import { NextResponse } from 'next/server';
import { getApiTranslations } from '@/i18n/api';

const SCRYFALL_URL = 'https://api.scryfall.com/cards/collection';

// Scryfall caps /cards/collection at 75 identifiers per request; the importer
// already batches by 75 (scryfall-resolver BATCH_SIZE). Anything larger is
// either a bug or abuse of this open proxy — reject before any outbound fetch.
const MAX_IDENTIFIERS = 75;
// Generous cap on raw body size (a 75-identifier batch is a few KB).
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: Request) {
	const t = await getApiTranslations({ namespace: 'apiErrors' });
	// Reject oversized bodies up front (defends the open proxy from abuse).
	const contentLength = Number(req.headers.get('content-length') ?? '0');
	if (contentLength > MAX_BODY_BYTES) {
		return NextResponse.json({ error: t('bodyTooLarge') }, { status: 413 });
	}

	const raw = await req.text();
	if (raw.length > MAX_BODY_BYTES) {
		return NextResponse.json({ error: t('bodyTooLarge') }, { status: 413 });
	}

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return NextResponse.json({ error: t('invalidJsonBody') }, { status: 400 });
	}

	// Validate shape: { identifiers: object[] } with 1..MAX_IDENTIFIERS entries.
	if (typeof body !== 'object' || body === null || !('identifiers' in body)) {
		return NextResponse.json({ error: t('missingIdentifiers') }, { status: 400 });
	}
	const { identifiers } = body as { identifiers: unknown };
	if (
		!Array.isArray(identifiers) ||
		identifiers.length === 0 ||
		identifiers.length > MAX_IDENTIFIERS ||
		!identifiers.every((i) => typeof i === 'object' && i !== null)
	) {
		return NextResponse.json({ error: t('invalidIdentifiers') }, { status: 400 });
	}

	const res = await fetch(SCRYFALL_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'User-Agent': 'Wizcard/1.0',
		},
		body: JSON.stringify({ identifiers }),
	});

	const data = await res.json();

	if (!res.ok) {
		return NextResponse.json(data, { status: res.status });
	}

	return NextResponse.json(data);
}
