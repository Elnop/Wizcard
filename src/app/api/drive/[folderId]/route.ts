// Google Cloud Console setup:
// 1. Enable "Google Drive API"
// 2. Create an API key, restrict to HTTP referrers (your domain)
// 3. Restrict key to "Google Drive API" only
// 4. Add GOOGLE_DRIVE_API_KEY=<key> to .env.local

import { NextResponse } from 'next/server';
import type { DriveFileRaw } from '@/lib/mpc/types';

export const revalidate = 3600;

const FOLDER_ID_RE = /^[a-zA-Z0-9_-]+$/;

interface DriveApiFile {
	id: string;
	name: string;
	mimeType: string;
}

interface DriveApiResponse {
	files: DriveApiFile[];
	error?: { message: string };
}

export async function GET(_req: Request, { params }: { params: Promise<{ folderId: string }> }) {
	const { folderId } = await params;

	if (!folderId || !FOLDER_ID_RE.test(folderId)) {
		return NextResponse.json({ error: 'Invalid folder ID' }, { status: 400 });
	}

	const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
	if (!apiKey) {
		return NextResponse.json({ error: 'Drive API not configured' }, { status: 500 });
	}

	const query = encodeURIComponent(`'${folderId}' in parents and mimeType contains 'image/'`);
	const fields = encodeURIComponent('files(id,name,mimeType)');
	const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&key=${apiKey}&pageSize=1000`;

	try {
		const res = await fetch(url, { next: { revalidate: 3600 } });
		const data = (await res.json()) as DriveApiResponse;

		if (!res.ok) {
			return NextResponse.json(
				{ error: data.error?.message ?? 'Drive API error' },
				{ status: res.status }
			);
		}

		const files: DriveFileRaw[] = (data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
		return NextResponse.json(files);
	} catch {
		return NextResponse.json({ error: 'Failed to reach Drive API' }, { status: 500 });
	}
}
