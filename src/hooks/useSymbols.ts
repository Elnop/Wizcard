'use client';

import { useState, useEffect } from 'react';
import { getAllSymbols } from '@/lib/scryfall/endpoints/symbols';
import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';

export function useSymbols(): Record<string, ScryfallCardSymbol> {
	const [symbolMap, setSymbolMap] = useState<Record<string, ScryfallCardSymbol>>({});

	useEffect(() => {
		getAllSymbols().then((list) => {
			const map: Record<string, ScryfallCardSymbol> = {};
			for (const symbol of list.data) {
				map[symbol.symbol] = symbol;
			}
			setSymbolMap(map);
		});
	}, []);

	return symbolMap;
}
