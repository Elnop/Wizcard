export type Language = 'en' | 'fr';
export type PriceCurrency = 'eur' | 'usd';
export type ThemePreference = 'light' | 'dark' | 'system';

export type Profile = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatarUrl: string | null;
	language: Language;
	priceCurrency: PriceCurrency;
	showPrices: boolean;
	themePreference: ThemePreference;
	isPublic: boolean;
	ignoredTags: string[];
	createdAt: string;
	updatedAt: string;
};

export type ProfileUpdate = Partial<
	Pick<
		Profile,
		| 'nickname'
		| 'description'
		| 'avatarUrl'
		| 'language'
		| 'priceCurrency'
		| 'showPrices'
		| 'themePreference'
		| 'isPublic'
		| 'ignoredTags'
	>
>;
