// Types for the EDHREC JSON API (unofficial, https://json.edhrec.com).
//
// EDHREC exposes a stable canonical endpoint per commander:
//   GET https://json.edhrec.com/pages/commanders/<slug>.json
// The response groups recommended cards into categorized "cardlists" found at
// `container.json_dict.cardlists`. Each card view carries a name and synergy /
// inclusion stats, but NO image or full card data — names must be resolved
// against Scryfall.

/** A single recommended card as returned by EDHREC. */
export interface EdhrecCardView {
	name: string;
	/** EDHREC slug for the card (lowercased, dashed). */
	sanitized: string;
	/** Synergy score relative to the commander, roughly in [-1, 1]. */
	synergy: number;
	/** Number of decks that include this card. */
	inclusion: number;
	num_decks: number;
	potential_decks: number;
}

/** One categorized section of recommendations (e.g. "High Synergy Cards"). */
export interface EdhrecCardlist {
	/** Machine tag, e.g. `highsynergycards`, `topcards`, `creatures`. */
	tag: string;
	/** Human-readable section title. */
	header: string;
	cardviews: EdhrecCardView[];
}

/** Minimal shape of the EDHREC commander page response we rely on. */
export interface EdhrecCommanderResponse {
	container?: {
		json_dict?: {
			cardlists?: EdhrecCardlist[];
		};
	};
}

/** Normalized recommendation section produced by `convert-recommendations`. */
export interface EdhrecSection {
	tag: string;
	header: string;
	cards: EdhrecCardView[];
}
