// Typed catalogue of every business event. ZERO PostHog import — this file is
// the vendor-neutral contract the whole app depends on. No PII in props: IDs and
// categories only, never email/name/purchase_price.
export type AnalyticsEvent =
	// Collection
	| {
			name: 'card_added';
			props: { scryfallId: string; isFoil: boolean; source: 'search' | 'import' | 'manual' };
	  }
	| { name: 'card_removed'; props: { scryfallId: string } }
	| { name: 'card_edited'; props: { rowId: string; fields: string[] } }
	| { name: 'print_changed'; props: { rowId: string; scryfallId: string } }
	| { name: 'collection_cleared'; props: { count: number } }
	// Decks
	| { name: 'deck_created'; props: { deckId: string } }
	| { name: 'deck_deleted'; props: { deckId: string } }
	| { name: 'card_added_to_deck'; props: { deckId: string; scryfallId: string } }
	| { name: 'deck_exported'; props: { deckId: string; format: 'pdf' } }
	| { name: 'sample_hand_drawn'; props: { deckId: string } }
	| { name: 'deck_stats_viewed'; props: { deckId: string } }
	// Import / Wishlist
	| { name: 'import_started'; props: { format: string } }
	| { name: 'import_completed'; props: { format: string; cardCount: number } }
	| { name: 'import_failed'; props: { format: string; reason: string } }
	| { name: 'wishlist_toggled'; props: { scryfallId: string; added: boolean } }
	| { name: 'wishlist_moved_to_collection'; props: { scryfallId: string } }
	// Search / Auth / Nav
	| { name: 'search_performed'; props: { hasFilters: boolean } }
	| { name: 'filter_applied'; props: { filterType: string } }
	| { name: 'signup'; props: { method: 'email' | 'google' | 'oauth' } }
	| { name: 'login'; props: { method: 'email' | 'google' | 'oauth' } }
	| { name: 'profile_viewed'; props: { isOwnProfile: boolean } };

export type EventName = AnalyticsEvent['name'];
