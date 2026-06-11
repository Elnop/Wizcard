// Shared scroll controller for both scroll panes. Owns a ScrollView ref and an
// auto-tail "following" flag, and translates key presses into ref scroll calls.
//
// The hook does NOT call useInput itself — the root HUD owns the single global
// useInput and forwards keys to the *active* pane's handleKey, so the two panes
// never fight over stdin.

import { useRef, useState, useEffect, useCallback } from 'react';
import type { Key } from 'ink';
import type { ScrollViewRef } from 'ink-scroll-view';

export interface ScrollNav {
	ref: React.RefObject<ScrollViewRef | null>;
	following: boolean;
	handleKey: (input: string, key: Key) => void;
}

interface Options {
	itemCount: number;
	// When true, the pane follows the tail: new items auto-scroll to bottom until
	// the user scrolls up. Sources pass false (position is preserved instead).
	autoTail: boolean;
}

export function useScrollNav({ itemCount, autoTail }: Options): ScrollNav {
	const ref = useRef<ScrollViewRef | null>(null);
	const [following, setFollowing] = useState<boolean>(autoTail);

	// Auto-tail: while following, keep pinned to the bottom as new items arrive.
	useEffect(() => {
		if (autoTail && following) ref.current?.scrollToBottom();
	}, [itemCount, autoTail, following]);

	const handleKey = useCallback(
		(input: string, key: Key): void => {
			const sv = ref.current;
			if (!sv) return;
			const page = Math.max(1, sv.getViewportHeight() - 1);
			const bottom = sv.getBottomOffset(); // 0 when content fits the viewport
			// scrollBy is unbounded in ink-scroll-view, so clamp the target offset to
			// [0, bottom] — there's nothing to reveal past either edge. Returns the
			// offset actually applied, so callers can decide whether to re-follow.
			const scrollByClamped = (delta: number): number => {
				const next = Math.max(0, Math.min(bottom, sv.getScrollOffset() + delta));
				sv.scrollTo(next);
				return next;
			};

			if (key.upArrow) {
				scrollByClamped(-1);
				setFollowing(false);
			} else if (key.downArrow) {
				// Re-engage follow once the user scrolls back down to the bottom.
				if (autoTail && scrollByClamped(1) >= bottom) setFollowing(true);
			} else if (key.pageUp) {
				scrollByClamped(-page);
				setFollowing(false);
			} else if (key.pageDown) {
				if (autoTail && scrollByClamped(page) >= bottom) setFollowing(true);
			} else if (key.home || input === 'g') {
				sv.scrollToTop();
				setFollowing(false);
			} else if (key.end || input === 'G') {
				sv.scrollToBottom();
				if (autoTail) setFollowing(true);
			}
		},
		[autoTail]
	);

	return { ref, following, handleKey };
}
