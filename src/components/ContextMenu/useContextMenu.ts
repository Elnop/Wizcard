import { useState, useCallback } from 'react';

type MenuState<T> = { data: T; position: { x: number; y: number } } | null;

export function useContextMenu<T>() {
	const [menu, setMenu] = useState<MenuState<T>>(null);

	const open = useCallback((data: T, e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setMenu({ data, position: { x: e.clientX, y: e.clientY } });
	}, []);

	const close = useCallback(() => setMenu(null), []);

	return { menu, open, close };
}
