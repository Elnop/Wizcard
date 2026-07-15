// Consent state persisted in localStorage. SSR-safe: returns 'unknown' when
// window is undefined (server render) so the banner logic degrades gracefully.
export type ConsentState = 'unknown' | 'granted' | 'denied';

export const CONSENT_STORAGE_KEY = 'wizcard-analytics-consent';

export function getConsent(): ConsentState {
	if (typeof window === 'undefined') return 'unknown';
	try {
		const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
		return value === 'granted' || value === 'denied' ? value : 'unknown';
	} catch {
		return 'unknown';
	}
}

export function setConsentState(state: 'granted' | 'denied'): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(CONSENT_STORAGE_KEY, state);
	} catch {
		// Storage unavailable (private mode / quota) — analytics stays anonymous.
	}
	notifyConsentListeners();
}

// useSyncExternalStore plumbing: a module-level set of listeners so consent
// changes (this tab via setConsentState, or another tab via the `storage`
// event) can trigger a re-render without setState-in-effect.
const listeners = new Set<() => void>();

function notifyConsentListeners(): void {
	for (const listener of listeners) listener();
}

export function subscribeConsent(listener: () => void): () => void {
	listeners.add(listener);

	// `storage` only fires in OTHER tabs/windows, not the one that wrote the
	// value — that's why setConsentState() also notifies directly above.
	const onStorage = (event: StorageEvent) => {
		if (event.key === CONSENT_STORAGE_KEY) listener();
	};
	if (typeof window !== 'undefined') {
		window.addEventListener('storage', onStorage);
	}

	return () => {
		listeners.delete(listener);
		if (typeof window !== 'undefined') {
			window.removeEventListener('storage', onStorage);
		}
	};
}
