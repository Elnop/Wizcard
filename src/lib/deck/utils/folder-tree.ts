import type { FolderMeta } from '@/types/decks';

export type FolderNode = FolderMeta & { children: FolderNode[] };

/** Build a tree from a flat list of FolderMeta. Roots are folders with parentId === null. */
export function buildFolderTree(folders: FolderMeta[]): FolderNode[] {
	const nodeMap = new Map<string, FolderNode>();
	for (const folder of folders) {
		nodeMap.set(folder.id, { ...folder, children: [] });
	}

	const roots: FolderNode[] = [];
	for (const node of nodeMap.values()) {
		if (node.parentId === null) {
			roots.push(node);
		} else {
			const parent = nodeMap.get(node.parentId);
			if (parent) {
				parent.children.push(node);
			} else {
				// Orphaned folder (parent was deleted) — treat as root
				roots.push(node);
			}
		}
	}

	const sortByPosition = (nodes: FolderNode[]) => {
		nodes.sort((a, b) => a.position - b.position);
		for (const node of nodes) sortByPosition(node.children);
	};
	sortByPosition(roots);

	return roots;
}

/** Return the path from the root down to (but not including) folderId. */
export function getFolderAncestors(
	folderId: string,
	folders: Record<string, FolderMeta>
): FolderMeta[] {
	const ancestors: FolderMeta[] = [];
	let current = folders[folderId];
	while (current?.parentId !== null && current?.parentId !== undefined) {
		const parent = folders[current.parentId];
		if (!parent) break;
		ancestors.unshift(parent);
		current = parent;
	}
	return ancestors;
}

/** Return all descendant folder IDs (recursive). Includes folderId itself. */
export function getAllDescendantIds(
	folderId: string,
	folders: Record<string, FolderMeta>
): string[] {
	const result: string[] = [folderId];
	for (const folder of Object.values(folders)) {
		if (folder.parentId === folderId) {
			result.push(...getAllDescendantIds(folder.id, folders));
		}
	}
	return result;
}
