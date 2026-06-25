import type { FolderMeta } from '@/types/decks';
import {
	type FolderDbRow,
	fetchFolderRows,
	insertFolderRow,
	updateFolderRow,
	deleteFolderRow,
} from '@/lib/supabase/queries/decks';

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
	return (await fetchFolderRows(userId)).map(rowToFolderMeta);
}

export async function insertFolder(userId: string, folder: FolderMeta): Promise<void> {
	await insertFolderRow({
		id: folder.id,
		owner_id: userId,
		parent_id: folder.parentId,
		name: folder.name,
		position: folder.position,
		created_at: folder.createdAt,
		updated_at: folder.updatedAt,
	});
}

export async function updateFolder(
	userId: string,
	folderId: string,
	updates: Partial<Pick<FolderMeta, 'name' | 'parentId' | 'position'>>
): Promise<void> {
	const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
	if (updates.name !== undefined) payload.name = updates.name;
	if (updates.parentId !== undefined) payload.parent_id = updates.parentId;
	if (updates.position !== undefined) payload.position = updates.position;
	await updateFolderRow(userId, folderId, payload);
}

export async function deleteFolder(userId: string, folderId: string): Promise<void> {
	await deleteFolderRow(userId, folderId);
}
