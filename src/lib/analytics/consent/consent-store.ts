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
}
