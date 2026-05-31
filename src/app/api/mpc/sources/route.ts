import { NextResponse } from 'next/server';
import type { MpcfillSourceRaw, MpcSource } from '@/lib/mpc/types';

export const revalidate = 3600;

interface MpcfillSourcesResponse {
	results: Record<string, MpcfillSourceRaw>;
}

const DRIVE_ID_RE = /[?&]id=([a-zA-Z0-9_-]+)|\/folders\/([a-zA-Z0-9_-]+)/;

function extractDriveId(externalLink: string): string | null {
	if (!externalLink) return null;
	const m = DRIVE_ID_RE.exec(externalLink);
	return m ? (m[1] ?? m[2] ?? null) : null;
}

export async function GET() {
	try {
		const res = await fetch('https://mpcfill.com/2/sources/', {
			next: { revalidate: 3600 },
			headers: { 'User-Agent': 'Wizcard/1.0' },
		});

		if (!res.ok) {
			return NextResponse.json({ error: `mpcfill returned ${res.status}` }, { status: 502 });
		}

		const data = (await res.json()) as MpcfillSourcesResponse;
		const raw = Object.values(data.results ?? {});

		const sources: MpcSource[] = raw
			.filter((s) => s.sourceType === 'Google Drive')
			.flatMap((s) => {
				const driveId = extractDriveId(s.externalLink);
				if (!driveId) return [];
				return [
					{
						id: driveId,
						name: s.name,
						description: s.description || undefined,
						isBuiltIn: true,
						tags: ['mpcfill', s.key],
					} satisfies MpcSource,
				];
			});

		return NextResponse.json(sources);
	} catch (err) {
		console.error('[/api/mpc/sources] fetch failed:', err);
		return NextResponse.json({ error: 'Failed to reach mpcfill.com' }, { status: 502 });
	}
}
