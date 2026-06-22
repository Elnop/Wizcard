import type { AnyCard, CardListSection } from '@/lib/card/components/CardList/CardList.types';

const CARD_TYPE_ORDER = [
	{ key: 'creature', label: 'Creatures' },
	{ key: 'planeswalker', label: 'Planeswalkers' },
	{ key: 'instant', label: 'Instants' },
	{ key: 'sorcery', label: 'Sorceries' },
	{ key: 'enchantment', label: 'Enchantments' },
	{ key: 'artifact', label: 'Artifacts' },
	{ key: 'land', label: 'Lands' },
	{ key: 'battle', label: 'Battles' },
] as const;

export function groupByCardType(
	cards: AnyCard[],
	countById?: Map<string, number>
): CardListSection[] {
	const buckets = new Map<string, AnyCard[]>();

	for (const card of cards) {
		const typeLine = card.type_line?.toLowerCase() ?? '';
		const matchedKey = CARD_TYPE_ORDER.find(({ key }) => typeLine.includes(key))?.key ?? 'other';
		const bucket = buckets.get(matchedKey) ?? [];
		bucket.push(card);
		buckets.set(matchedKey, bucket);
	}

	function toSection(key: string, label: string): CardListSection | null {
		const group = buckets.get(key);
		if (!group || group.length === 0) return null;
		const total = countById
			? group.reduce((sum, c) => sum + (countById.get(c.id) ?? 1), 0)
			: group.length;
		// Stable key (the type slug) so the open/collapsed state survives the count
		// in the label changing when cards move in or out of the subsection.
		return { key, label: `${label} (${total})`, cards: group, border: false, background: false };
	}

	return [
		...CARD_TYPE_ORDER.map(({ key, label }) => toSection(key, label)),
		toSection('other', 'Other'),
	].filter((s): s is CardListSection => s !== null);
}
