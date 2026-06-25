import { toCustomCard } from '@/lib/mpc/adapter';
import type { CustomCard, MpcSource } from '@/lib/mpc/types';
import {
	fetchCustomCardRowById,
	fetchCustomCardSourceRowById,
} from '@/lib/supabase/queries/custom-cards.server';
import { rowToMpcCard, rowToMpcSource } from './custom-cards';

export async function getCustomCardWithSource(id: string): Promise<CustomCard | null> {
	const row = await fetchCustomCardRowById(id);
	if (!row) return null;

	let source: MpcSource = {
		id: row.source_id ?? 'unknown',
		name: row.source_id ?? 'Custom',
		isBuiltIn: false,
		tags: [],
		driveFolderId: null,
	};

	if (row.source_id) {
		const sourceRow = await fetchCustomCardSourceRowById(row.source_id);
		if (sourceRow) source = rowToMpcSource(sourceRow);
	}

	return toCustomCard(rowToMpcCard(row), source);
}
