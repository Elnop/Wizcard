// In-memory cache with TTL for Scryfall API responses

import type { ScryfallCacheEntry } from './types/api';

const CACHE_MAX_AGE = 300_000; // 5 minutes
const CACHE_MAX_SIZE = 1000;

const cache = new Map<string, ScryfallCacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
	const entry = cache.get(key);
	if (!entry) return null;

	if (Date.now() - entry.timestamp > CACHE_MAX_AGE) {
		cache.delete(key);
		return null;
	}

	return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
	// Evict oldest entries if cache is full
	if (cache.size >= CACHE_MAX_SIZE) {
		const firstKey = cache.keys().next().value;
		if (firstKey !== undefined) {
			cache.delete(firstKey);
		}
	}

	cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(): void {
	cache.clear();
}

export function cleanupCache(): void {
	const now = Date.now();
	for (const [key, entry] of cache.entries()) {
		if (now - entry.timestamp > CACHE_MAX_AGE) {
			cache.delete(key);
		}
	}
}
