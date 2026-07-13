import { NextResponse } from 'next/server';
import { getApiTranslations } from '@/i18n/api';

const EDHREC_JSON_BASE = 'https://json.edhrec.com/pages/commanders';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
	const t = await getApiTranslations();
	const { slug } = await params;

	if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
		return NextResponse.json({ error: t('invalidCommanderSlug') }, { status: 400 });
	}

	const res = await fetch(`${EDHREC_JSON_BASE}/${slug}.json`, {
		headers: {
			'User-Agent':
				process.env.EDHREC_USER_AGENT ?? 'Wizcard/1.0 (https://github.com/devinedev/wizcard)',
			Accept: 'application/json',
		},
	});

	if (!res.ok) {
		// EDHREC returns 403 (not 404) for commanders it has no page for; treat
		// both as "no data" so the UI can show a friendly empty state.
		const notFound = res.status === 404 || res.status === 403;
		const status = notFound ? 404 : 502;
		return NextResponse.json(
			{
				error: notFound ? t('noEdhrecData') : t('edhrecFetchFailed'),
			},
			{ status }
		);
	}

	const data = await res.json();
	// EDHREC data changes slowly; cache for a day with brief stale-while-revalidate.
	return NextResponse.json(data, {
		headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200' },
	});
}
