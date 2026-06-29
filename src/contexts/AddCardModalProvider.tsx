'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { CardEntry } from '@/types/cards';
import type { ScryfallCard } from '@/lib/scryfall/types/scryfall';
import type { DeckZone } from '@/types/decks';
import { AddCardModal } from '@/lib/card/components/AddCardModal/AddCardModal';

/** Params for opening the add-card modal — mirrors AddCardModal's props minus onClose. */
export type AddCardModalParams = {
	scryfallCard: ScryfallCard;
	onAdd: (card: ScryfallCard, entry: Partial<CardEntry>, count: number) => void;
	availableZones?: DeckZone[];
	defaultZone?: DeckZone;
	hideQuantity?: boolean;
	maxQuantity?: number;
	initialEntry?: Partial<CardEntry>;
};

type AddCardModalContextValue = {
	openAddCard: (params: AddCardModalParams) => void;
	close: () => void;
};

const AddCardModalContext = createContext<AddCardModalContextValue | null>(null);

/**
 * Global provider that owns the add-card modal's open-state and renders
 * `AddCardModal` once at the root. Unlike AddToDeckModalProvider it does NOT
 * derive behaviour from the card type — the callbacks differ per call site
 * (collection vs wishlist add, wishlist move-to-collection…), so the caller
 * passes `onAdd` (and any extras) to `openAddCard`.
 */
export function AddCardModalProvider({ children }: { children: React.ReactNode }) {
	const [params, setParams] = useState<AddCardModalParams | null>(null);

	const openAddCard = useCallback((p: AddCardModalParams) => setParams(p), []);
	const close = useCallback(() => setParams(null), []);

	const value = useMemo<AddCardModalContextValue>(
		() => ({ openAddCard, close }),
		[openAddCard, close]
	);

	return (
		<AddCardModalContext.Provider value={value}>
			{children}
			{params && (
				<AddCardModal
					key={params.scryfallCard.id}
					scryfallCard={params.scryfallCard}
					onAdd={params.onAdd}
					availableZones={params.availableZones}
					defaultZone={params.defaultZone}
					hideQuantity={params.hideQuantity}
					maxQuantity={params.maxQuantity}
					initialEntry={params.initialEntry}
					onClose={close}
				/>
			)}
		</AddCardModalContext.Provider>
	);
}

export function useAddCardModal(): AddCardModalContextValue {
	const ctx = useContext(AddCardModalContext);
	if (!ctx) throw new Error('useAddCardModal must be used within an AddCardModalProvider');
	return ctx;
}
