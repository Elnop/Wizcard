// Event-log filter levels, shared by the footer, the events pane and the root.

import type { HudEvent } from '../logger';

export type FilterLevel = 'e' | 'w' | 'i' | 'd';

export const FILTER_LABELS: Record<FilterLevel, string> = {
	e: 'e=error',
	w: 'w=warn+',
	i: 'i=info+',
	d: 'd=all',
};

export function filterEvents(events: HudEvent[], filter: FilterLevel): HudEvent[] {
	if (filter === 'e') return events.filter((ev) => ev.level === 'error');
	if (filter === 'w') return events.filter((ev) => ev.level === 'warn' || ev.level === 'error');
	return events;
}
