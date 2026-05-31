'use client';

import { create } from 'zustand';
import { loadUserSources, saveUserSource, removeUserSource } from '../sources';
import { fetchDriveFolder } from '../drive';
import type { MpcCard, MpcSource } from '../types';

const CACHE_TTL_MS = 60 * 60 * 1000;

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

	initSources: async () => {
		if (get().sources.length > 0 || get().sourcesLoading) return;
		set({ sourcesLoading: true, sourcesError: null });
		try {
			const res = await fetch('/api/mpc/sources');
			if (!res.ok) throw new Error(`Sources fetch failed: ${res.status}`);
			const builtIn = (await res.json()) as MpcSource[];
			const userSources = loadUserSources();
			const allSourceIds = new Set(builtIn.map((s) => s.id));
			const uniqueUser = userSources.filter((s) => !allSourceIds.has(s.id));
			set({ sources: [...builtIn, ...uniqueUser], sourcesLoading: false });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			set({ sourcesError: message, sourcesLoading: false });
		}
	},

	fetchSource: async (sourceId: string) => {
		const { _cache, cardsBySource } = get();
		const cached = _cache[sourceId];
		if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
			if (!cardsBySource[sourceId]) {
				set({ cardsBySource: { ...cardsBySource, [sourceId]: cached.cards } });
			}
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
		removeUserSource(sourceId);
		set((s) => ({
			sources: s.sources.filter((x) => x.id !== sourceId),
		}));
	},
}));
