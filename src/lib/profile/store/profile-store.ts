'use client';

import { create } from 'zustand';
import type { Profile, ProfileUpdate } from '@/lib/profile/types';
import { fetchProfile } from '@/lib/profile/db/profiles';

type ProfileState = {
	profile: Profile | null;
	isLoading: boolean;
};

type ProfileActions = {
	hydrateProfile: (userId: string) => Promise<void>;
	applyProfileUpdate: (patch: ProfileUpdate) => void;
	reset: () => void;
};

export const useProfileStore = create<ProfileState & ProfileActions>()((set, get) => ({
	profile: null,
	isLoading: false,

	hydrateProfile: async (userId) => {
		set({ isLoading: true });
		try {
			const profile = await fetchProfile(userId);
			set({
				profile: profile ?? {
					id: userId,
					nickname: null,
					description: null,
					avatarUrl: null,
					language: 'fr',
					priceCurrency: 'eur',
					showPrices: true,
					themePreference: 'system',
					isPublic: true,
					createdAt: '',
					updatedAt: '',
				},
				isLoading: false,
			});
		} catch (err) {
			console.error('Failed to hydrate profile', err);
			set({ isLoading: false });
		}
	},

	applyProfileUpdate: (patch) => {
		const current = get().profile;
		if (!current) return;
		set({ profile: { ...current, ...patch } });
	},

	reset: () => set({ profile: null, isLoading: false }),
}));
