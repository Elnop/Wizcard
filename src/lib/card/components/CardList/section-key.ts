import type { CardListSection } from './CardList.types';

/**
 * Stable identity for a section's open/collapsed state.
 *
 * The collapsed-state map is keyed by this value, so it must NOT change when a
 * section's contents change. The visible `label` embeds a live card count
 * (e.g. "Maybeboard (5)"), which changes whenever a card moves in or out of the
 * zone — keying off the label would reset the open/collapsed state on every
 * move. Sections that need stable state therefore provide an explicit `key`;
 * we fall back to `label` only when no key is given.
 */
export function sectionKey(section: CardListSection): string {
	return section.key ?? section.label;
}
