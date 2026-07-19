import type { Profile } from '@/lib/profile/types';
import type { CustomCard } from '@/lib/mpc/types';

/** Guest default: hide NSFW even when no profile is loaded. */
export const DEFAULT_IGNORED_TAGS: string[] = ['nsfw'];

/** Tags to hide: the profile's list, or the guest default when signed out. */
export function getEffectiveIgnoredTags(profile: Profile | null): string[] {
	return profile?.ignoredTags ?? DEFAULT_IGNORED_TAGS;
}

/** True when any of the custom card's tags is ignored (case-insensitive). */
export function isIgnored(card: CustomCard, ignoredTags: string[]): boolean {
	if (ignoredTags.length === 0) return false;
	const ignored = new Set(ignoredTags.map((t) => t.toLowerCase()));
	return (card.custom.tags ?? []).some((t) => ignored.has(t.toLowerCase()));
}
