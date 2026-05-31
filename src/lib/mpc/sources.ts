import type { MpcSource } from './types';

const STORAGE_KEY = 'mpc-user-sources';

export function loadUserSources(): MpcSource[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as MpcSource[]) : [];
	} catch {
		return [];
	}
}

export function saveUserSource(source: MpcSource): void {
	if (typeof window === 'undefined') return;
	const existing = loadUserSources();
	const updated = [...existing.filter((s) => s.id !== source.id), source];
	localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function removeUserSource(sourceId: string): void {
	if (typeof window === 'undefined') return;
	const updated = loadUserSources().filter((s) => s.id !== sourceId);
	localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
