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
		let matched = false;
		for (const { key } of CARD_TYPE_ORDER) {
			if (typeLine.includes(key)) {
				const existing = buckets.get(key);
				if (existing) {
					existing.push(card);
				} else {
					buckets.set(key, [card]);
				}
				matched = true;
				break;
			}
		}
		if (!matched) {
			const existing = buckets.get('other');
			if (existing) {
				existing.push(card);
			} else {
				buckets.set('other', [card]);
			}
		}
	}

	const sections: CardListSection[] = [];
	for (const { key, label } of CARD_TYPE_ORDER) {
		const group = buckets.get(key);
		if (group && group.length > 0) {
			const total = countById
				? group.reduce((sum, c) => sum + (countById.get(c.id) ?? 1), 0)
				: group.length;
			sections.push({ label: `${label} (${total})`, cards: group });
		}
	}
	const other = buckets.get('other');
	if (other && other.length > 0) {
		const total = countById
			? other.reduce((sum, c) => sum + (countById.get(c.id) ?? 1), 0)
			: other.length;
		sections.push({ label: `Other (${total})`, cards: other });
	}

	return sections;
}
