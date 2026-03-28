import type { CardListColumn } from '@/components/ui/CardListTable/CardListTable.types';

export const STATIC_IMPORT_COLUMNS: CardListColumn[] = [
	{ key: 'name', label: 'Nom' },
	{
		key: 'set',
		label: 'Set',
		render: (card) => ('set' in card ? (card.set as string).toUpperCase() : '—'),
	},
	{
		key: 'collector_number',
		label: 'Collector #',
		render: (card) => ('collector_number' in card ? (card.collector_number as string) : '—'),
	},
];
