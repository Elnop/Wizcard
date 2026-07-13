import { NextResponse } from 'next/server';
import { getApiTranslations } from '@/i18n/api';

const MOXFIELD_API = 'https://api.moxfield.com/v2/decks/all';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
	const t = await getApiTranslations({ namespace: 'apiErrors' });
	const { id } = await params;

	if (!/^[A-Za-z0-9_-]{5,30}$/.test(id)) {
		return NextResponse.json({ error: t('invalidDeckId') }, { status: 400 });
	}

	const res = await fetch(`${MOXFIELD_API}/${encodeURIComponent(id)}`, {
		headers: {
			'User-Agent': process.env.MOXFIELD_USER_AGENT ?? 'Wizcard/1.0',
			Accept: 'application/json',
		},
	});

	if (!res.ok) {
		const status = res.status === 404 || res.status === 403 ? res.status : 502;
		return NextResponse.json(
			{ error: status === 404 ? t('deckNotFound') : t('moxfieldFetchFailed') },
			{ status }
		);
	}

	const data = await res.json();
	return NextResponse.json(data);
}
