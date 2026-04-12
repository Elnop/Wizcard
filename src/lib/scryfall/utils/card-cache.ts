// Persistent IndexedDB cache for ScryfallCard data and collection entries.
// Silently falls back to no-op if IndexedDB is unavailable (private mode, etc.).

import type { ScryfallCard, ScryfallImageUris } from '@/lib/scryfall/types/scryfall';
import type { CardEntry } from '@/types/cards';
import type { CollectionData } from '@/lib/collection/db/collection-migrations';

interface CachedCard {
	id: string; // ScryfallUUID — keyPath of the object store
	data: ScryfallCard;
	cachedAt: number; // Date.now()
}

interface CachedCollectionEntry {
	rowId: string; // keyPath
	scryfallId: string;
	entry: CardEntry;
}

/** Cached localized image URIs, keyed by "set/collector_number/lang". */
export interface CachedLocalizedImage {
	key: string; // keyPath — "set/collector_number/lang"
	image_uris?: ScryfallImageUris;
	face_image_uris?: (ScryfallImageUris | undefined)[];
	cachedAt: number;
}

const DB_NAME = 'wizcard-cache';
const STORE_NAME = 'scryfall-cards';
const COLLECTION_STORE = 'collection-entries';
const LOCALIZED_IMAGE_STORE = 'localized-images';
const TTL_MS = 86_400_000; // 24 hours

// Lazily opened DB promise — only one IDBDatabase instance across the module lifetime
let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 2);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains(COLLECTION_STORE)) {
				db.createObjectStore(COLLECTION_STORE, { keyPath: 'rowId' });
			}
			if (!db.objectStoreNames.contains(LOCALIZED_IMAGE_STORE)) {
				db.createObjectStore(LOCALIZED_IMAGE_STORE, { keyPath: 'key' });
			}
		};

		request.onsuccess = () => {
			const db = request.result;
			// Purge expired entries asynchronously — don't block the open
			void purgeExpired(db);
			resolve(db);
		};

		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('IndexedDB blocked'));
	});

	// If the DB open fails, clear the cached promise so subsequent calls retry
	dbPromise.catch(() => {
		dbPromise = null;
	});

	return dbPromise;
}

function purgeExpired(db: IDBDatabase): Promise<void> {
	return new Promise<void>((resolve) => {
		try {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			const request = store.openCursor();
			const cutoff = Date.now() - TTL_MS;

			request.onsuccess = () => {
				const cursor = request.result;
				if (!cursor) {
					resolve();
					return;
				}
				const entry = cursor.value as CachedCard;
				if (entry.cachedAt < cutoff) {
					cursor.delete();
				}
				cursor.continue();
			};

			request.onerror = () => resolve(); // non-critical, ignore errors
			tx.oncomplete = () => resolve();
		} catch {
			resolve();
		}
	});
}

/** Read a batch of cards from the cache. Returns a Map of id → ScryfallCard for hits only. */
export async function getCardsFromCache(ids: string[]): Promise<Map<string, ScryfallCard>> {
	const result = new Map<string, ScryfallCard>();
	if (ids.length === 0) return result;

	try {
		const db = await openDB();
		return new Promise<Map<string, ScryfallCard>>((resolve) => {
			try {
				const tx = db.transaction(STORE_NAME, 'readonly');
				const store = tx.objectStore(STORE_NAME);
				const cutoff = Date.now() - TTL_MS;
				let pending = ids.length;

				for (const id of ids) {
					const req = store.get(id);
					req.onsuccess = () => {
						const entry = req.result as CachedCard | undefined;
						if (entry && entry.cachedAt >= cutoff) {
							result.set(id, entry.data);
						}
						pending--;
						if (pending === 0) resolve(result);
					};
					req.onerror = () => {
						pending--;
						if (pending === 0) resolve(result);
					};
				}
			} catch {
				resolve(result);
			}
		});
	} catch {
		// IndexedDB unavailable — return empty map (fallback to network)
		return result;
	}
}

/** Write a batch of ScryfallCards to the cache. */
export async function putCardsInCache(cards: ScryfallCard[]): Promise<void> {
	if (cards.length === 0) return;

	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(STORE_NAME, 'readwrite');
				const store = tx.objectStore(STORE_NAME);
				const now = Date.now();

				for (const card of cards) {
					const entry: CachedCard = { id: card.id, data: card, cachedAt: now };
					store.put(entry);
				}

				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve(); // non-critical
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}

/** Read all collection entries from IndexedDB cache. */
export async function getCollectionFromCache(): Promise<CollectionData> {
	const result: CollectionData = {};
	try {
		const db = await openDB();
		return new Promise<CollectionData>((resolve) => {
			try {
				const tx = db.transaction(COLLECTION_STORE, 'readonly');
				const store = tx.objectStore(COLLECTION_STORE);
				const request = store.openCursor();
				request.onsuccess = () => {
					const cursor = request.result;
					if (!cursor) {
						resolve(result);
						return;
					}
					const row = cursor.value as CachedCollectionEntry;
					result[row.rowId] = { scryfallId: row.scryfallId, entry: row.entry };
					cursor.continue();
				};
				request.onerror = () => resolve(result);
			} catch {
				resolve(result);
			}
		});
	} catch {
		return result;
	}
}

/** Upsert a batch of collection entries into IndexedDB cache. */
export async function putCollectionEntriesInCache(
	entries: Array<{ rowId: string; scryfallId: string; entry: CardEntry }>
): Promise<void> {
	if (entries.length === 0) return;
	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(COLLECTION_STORE, 'readwrite');
				const store = tx.objectStore(COLLECTION_STORE);
				for (const e of entries) {
					store.put({ rowId: e.rowId, scryfallId: e.scryfallId, entry: e.entry });
				}
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}

/** Delete a batch of collection entries from IndexedDB cache. */
export async function deleteCollectionEntriesFromCache(rowIds: string[]): Promise<void> {
	if (rowIds.length === 0) return;
	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(COLLECTION_STORE, 'readwrite');
				const store = tx.objectStore(COLLECTION_STORE);
				for (const rowId of rowIds) store.delete(rowId);
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}

/** Read a localized image entry from the cache. Returns null on miss or expiry. */
export async function getLocalizedImageFromCache(
	key: string
): Promise<CachedLocalizedImage | null> {
	try {
		const db = await openDB();
		return new Promise<CachedLocalizedImage | null>((resolve) => {
			try {
				const tx = db.transaction(LOCALIZED_IMAGE_STORE, 'readonly');
				const req = tx.objectStore(LOCALIZED_IMAGE_STORE).get(key);
				req.onsuccess = () => {
					const entry = req.result as CachedLocalizedImage | undefined;
					if (entry && entry.cachedAt >= Date.now() - TTL_MS) {
						resolve(entry);
					} else {
						resolve(null);
					}
				};
				req.onerror = () => resolve(null);
			} catch {
				resolve(null);
			}
		});
	} catch {
		return null;
	}
}

/** Write a localized image entry to the cache. */
export async function putLocalizedImageInCache(entry: CachedLocalizedImage): Promise<void> {
	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(LOCALIZED_IMAGE_STORE, 'readwrite');
				tx.objectStore(LOCALIZED_IMAGE_STORE).put(entry);
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}

/** Clear all collection entries from IndexedDB cache (logout / clear collection). */
export async function clearCollectionCache(): Promise<void> {
	try {
		const db = await openDB();
		return new Promise<void>((resolve) => {
			try {
				const tx = db.transaction(COLLECTION_STORE, 'readwrite');
				tx.objectStore(COLLECTION_STORE).clear();
				tx.oncomplete = () => resolve();
				tx.onerror = () => resolve();
			} catch {
				resolve();
			}
		});
	} catch {
		// IndexedDB unavailable — silently skip
	}
}
