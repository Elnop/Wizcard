import { createClient } from '@/lib/supabase/server';
import { toCustomCard } from '@/lib/mpc/adapter';
import type { CustomCard, MpcSource } from '@/lib/mpc/types';
import {
	CUSTOM_CARD_SELECT,
	CUSTOM_CARD_SOURCE_SELECT,
	rowToMpcCard,
	rowToMpcSource,
} from './custom-cards';
import type { CustomCardRow, CustomCardSourceRow } from './custom-cards';

export async function getCustomCardWithSource(id: string): Promise<CustomCard | null> {
	const rawId = id;
	const client = await createClient();

	const { data: cardRow, error: cardError } = await client
		.from('custom_cards')
		.select(CUSTOM_CARD_SELECT)
		.eq('id', rawId)
		.single();

	if (cardError || !cardRow) return null;

	const row = cardRow as CustomCardRow;
	let source: MpcSource = {
		id: row.source_id ?? 'unknown',
		name: row.source_id ?? 'Custom',
		isBuiltIn: false,
		tags: [],
		driveFolderId: null,
	};

	if (row.source_id) {
		const { data: sourceRow } = await client
			.from('custom_card_sources')
			.select(CUSTOM_CARD_SOURCE_SELECT)
			.eq('id', row.source_id)
			.single();
		if (sourceRow) source = rowToMpcSource(sourceRow as CustomCardSourceRow);
	}

	const mpcCard = rowToMpcCard(row);
	return toCustomCard(mpcCard, source);
}
