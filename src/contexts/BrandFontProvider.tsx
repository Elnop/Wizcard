'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BRAND_FONTS, getBrandFontById, type BrandFont } from '@/fonts/brand';

const STORAGE_KEY = 'wizcard-brand-font';

type BrandFontContextValue = {
	font: BrandFont | null;
	reroll: () => void;
};

const BrandFontContext = createContext<BrandFontContextValue | null>(null);

/** Tire un id de font au hasard, en évitant `exclude` si possible. */
function pickRandomId(exclude?: string): string {
	const pool = BRAND_FONTS.filter((f) => f.id !== exclude);
	const source = pool.length > 0 ? pool : BRAND_FONTS;
	return source[Math.floor(Math.random() * source.length)].id;
}

function readStoredId(): string | null {
	try {
		return sessionStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeStoredId(id: string): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, id);
	} catch {
		// sessionStorage indisponible (mode privé strict) : dégradation silencieuse.
	}
}

export function BrandFontProvider({ children }: { children: React.ReactNode }) {
	// null au SSR et au premier render client → aucun mismatch d'hydratation.
	const [fontId, setFontId] = useState<string | null>(null);

	useEffect(() => {
		// Client-only résolution de la font : démarrer à null au SSR/premier render
		// évite le mismatch d'hydratation, mais impose de fixer l'état après montage.
		// L'alternative render-time casserait justement l'hydratation.
		const stored = readStoredId();
		if (stored && getBrandFontById(stored)) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- voir commentaire ci-dessus
			setFontId(stored);
			return;
		}
		const next = pickRandomId();
		writeStoredId(next);
		setFontId(next);
	}, []);

	const reroll = useCallback(() => {
		setFontId((current) => {
			const next = pickRandomId(current ?? undefined);
			writeStoredId(next);
			return next;
		});
	}, []);

	const value = useMemo<BrandFontContextValue>(
		() => ({ font: fontId ? (getBrandFontById(fontId) ?? null) : null, reroll }),
		[fontId, reroll]
	);

	return <BrandFontContext.Provider value={value}>{children}</BrandFontContext.Provider>;
}

export function useBrandFont(): BrandFontContextValue {
	const ctx = useContext(BrandFontContext);
	if (!ctx) {
		throw new Error('useBrandFont must be used within a BrandFontProvider');
	}
	return ctx;
}
