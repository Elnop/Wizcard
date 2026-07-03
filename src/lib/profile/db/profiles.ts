import { createClient } from '@/lib/supabase/client';
import type { Profile, ProfileUpdate } from '@/lib/profile/types';

type ProfileRow = {
	id: string;
	nickname: string | null;
	description: string | null;
	avatar_url: string | null;
	created_at: string;
	updated_at: string;
};

function rowToProfile(row: ProfileRow): Profile {
	return {
		id: row.id,
		nickname: row.nickname,
		description: row.description,
		avatarUrl: row.avatar_url,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('profiles')
		.select('id, nickname, description, avatar_url, created_at, updated_at')
		.eq('id', userId)
		.maybeSingle();
	if (error) throw error;
	return data ? rowToProfile(data as ProfileRow) : null;
}

export async function upsertProfile(userId: string, updates: ProfileUpdate): Promise<void> {
	const supabase = createClient();
	const cols: Record<string, unknown> = { id: userId, updated_at: new Date().toISOString() };
	if (updates.nickname !== undefined) cols.nickname = updates.nickname;
	if (updates.description !== undefined) cols.description = updates.description;
	if (updates.avatarUrl !== undefined) cols.avatar_url = updates.avatarUrl;
	const { error } = await supabase.from('profiles').upsert(cols);
	if (error) throw error;
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
	const supabase = createClient();
	const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
	const path = `${userId}/avatar.${ext}`;
	const { error } = await supabase.storage
		.from('avatars')
		.upload(path, file, { upsert: true, contentType: file.type });
	if (error) throw error;
	const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
	return `${base}/storage/v1/object/public/avatars/${path}?t=${Date.now()}`;
}
