import type { FolderMeta } from '@/types/decks';
import { createClient } from '@/lib/supabase/client';

type FolderDbRow = {
	id: string;
	owner_id: string;
	parent_id: string | null;
	name: string;
	position: number;
	created_at: string;
	updated_at: string;
};

function rowToFolderMeta(row: FolderDbRow): FolderMeta {
	return {
		id: row.id,
		parentId: row.parent_id,
		name: row.name,
		position: row.position,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function fetchFolders(userId: string): Promise<FolderMeta[]> {
	const supabase = createClient();
	const { data, error } = await supabase
		.from('deck_folders')
		.select('*')
		.eq('owner_id', userId)
		.order('position', { ascending: true });

	if (error) {
		throw new Error(`[folders] fetchFolders error: ${error.message}`);
	}

	return (data as FolderDbRow[]).map(rowToFolderMeta);
}

export async function insertFolder(userId: string, folder: FolderMeta): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase.from('deck_folders').insert({
		id: folder.id,
		owner_id: userId,
		parent_id: folder.parentId,
		name: folder.name,
		position: folder.position,
		created_at: folder.createdAt,
		updated_at: folder.updatedAt,
	});

	if (error) {
		throw new Error(`[folders] insertFolder error: ${error.message}`);
	}
}

export async function updateFolder(
	userId: string,
	folderId: string,
	updates: Partial<Pick<FolderMeta, 'name' | 'parentId' | 'position'>>
): Promise<void> {
	const supabase = createClient();
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.parentId !== undefined) payload.parent_id = updates.parentId;
	if (updates.position !== undefined) payload.position = updates.position;

	const { error } = await supabase
		.from('deck_folders')
		.update(payload)
		.eq('owner_id', userId)
		.eq('id', folderId);

	if (error) {
		throw new Error(`[folders] updateFolder error: ${error.message}`);
	}
}

export async function deleteFolder(userId: string, folderId: string): Promise<void> {
	const supabase = createClient();
	const { error } = await supabase
		.from('deck_folders')
		.delete()
		.eq('owner_id', userId)
		.eq('id', folderId);

	if (error) {
		throw new Error(`[folders] deleteFolder error: ${error.message}`);
	}
}
