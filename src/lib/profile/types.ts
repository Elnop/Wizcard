export type Profile = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatarUrl: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ProfileUpdate = Partial<Pick<Profile, 'nickname' | 'description' | 'avatarUrl'>>;
