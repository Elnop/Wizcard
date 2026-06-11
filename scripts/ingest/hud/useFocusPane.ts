// Tracks which scroll pane currently owns the arrow keys. Tab toggles between
// the two; only the active pane reacts to navigation input.

import { useState, useCallback } from 'react';

export type PaneId = 'sources' | 'events';

export interface FocusPane {
	active: PaneId;
	toggle: () => void;
}

export function useFocusPane(initial: PaneId = 'events'): FocusPane {
	const [active, setActive] = useState<PaneId>(initial);
	const toggle = useCallback(() => {
		setActive((p) => (p === 'sources' ? 'events' : 'sources'));
	}, []);
	return { active, toggle };
}
