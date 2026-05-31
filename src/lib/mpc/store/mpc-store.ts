'use client';

import { create } from 'zustand';
import {
	loadUserSources,
	saveUserSource,
	removeUserSource as persistRemoveUserSource,
} from '../sources';
import { fetchDriveFolder } from '../drive';
import type { MpcCard, MpcSource } from '../types';

const CACHE_TTL_MS = 60 * 60 * 1000;

let _initPromise: Promise<void> | null = null;

interface CacheEntry {
	cards: MpcCard[];
	fetchedAt: number;
}

interface MpcState {
	sources: MpcSource[];
	sourcesLoading: boolean;
	sourcesError: string | null;
	cardsBySource: Record<string, MpcCard[]>;
	loadingSourceId: string | null;
	errorBySource: Record<string, string>;
	_cache: Record<string, CacheEntry>;

	initSources: () => Promise<void>;
	fetchSource: (sourceId: string) => Promise<void>;
	addUserSource: (source: MpcSource) => void;
	removeUserSource: (sourceId: string) => void;
}

export const useMpcStore = create<MpcState>((set, get) => ({
	sources: [],
	sourcesLoading: false,
	sourcesError: null,
	cardsBySource: {},
	loadingSourceId: null,
	errorBySource: {},
	_cache: {},

	initSources: () => {
		if (get().sources.length > 0) return Promise.resolve();
		if (_initPromise) return _initPromise;
		_initPromise = (async () => {
			set({ sourcesLoading: true, sourcesError: null });
			try {
				const res = await fetch('/api/mpc/sources');
				if (!res.ok) throw new Error(`Sources fetch failed: ${res.status}`);
				const builtIn = (await res.json()) as unknown;
				if (!Array.isArray(builtIn))
					throw new Error('Unexpected response shape from /api/mpc/sources');
				const sources = builtIn as MpcSource[];
				const userSources = loadUserSources();
				const allSourceIds = new Set(sources.map((s) => s.id));
				const uniqueUser = userSources.filter((s) => !allSourceIds.has(s.id));
				const droppedCount = userSources.length - uniqueUser.length;
				if (droppedCount > 0) {
					console.info(
						`[mpc-store] ${droppedCount} user source(s) hidden: already present as built-in.`
					);
				}
				set({ sources: [...sources, ...uniqueUser], sourcesLoading: false });
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Unknown error';
				set({ sourcesError: message, sourcesLoading: false });
			} finally {
				_initPromise = null;
			}
		})();
		return _initPromise;
	},

	fetchSource: async (sourceId: string) => {
		const { _cache } = get();
		const cached = _cache[sourceId];
		if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
			set((s) => ({
				cardsBySource: s.cardsBySource[sourceId]
					? s.cardsBySource
					: { ...s.cardsBySource, [sourceId]: cached.cards },
				loadingSourceId: s.loadingSourceId === sourceId ? null : s.loadingSourceId,
			}));
			return;
		}

		set({ loadingSourceId: sourceId });
		try {
			const cards = await fetchDriveFolder(sourceId);
			const now = Date.now();
			set((s) => ({
				cardsBySource: { ...s.cardsBySource, [sourceId]: cards },
				_cache: { ...s._cache, [sourceId]: { cards, fetchedAt: now } },
				loadingSourceId: null,
				errorBySource: { ...s.errorBySource, [sourceId]: '' },
			}));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			set((s) => ({
				loadingSourceId: null,
				errorBySource: { ...s.errorBySource, [sourceId]: message },
			}));
		}
	},

	addUserSource: (source: MpcSource) => {
		saveUserSource(source);
		set((s) => ({
			sources: [...s.sources.filter((x) => x.id !== source.id), source],
		}));
	},

	removeUserSource: (sourceId: string) => {
		persistRemoveUserSource(sourceId);
		set((s) => ({
			sources: s.sources.filter((x) => x.id !== sourceId),
		}));
	},
}));
