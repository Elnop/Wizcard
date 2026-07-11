/**
 * Classe et humanise les rejets des triggers de quota DB
 * (cf. supabase/migrations/20260711120000_add_usage_quotas.sql).
 * Les triggers lèvent des exceptions dont le message COMMENCE par un préfixe
 * WIZCARD_*. Le préfixe traverse PostgREST dans error.message.
 */

const USAGE_LIMIT_MESSAGES: Record<string, string> = {
	WIZCARD_LIMIT_DECKS: 'Limite atteinte : 1000 decks maximum par compte.',
	WIZCARD_LIMIT_DECK_CARDS: 'Limite atteinte : 5000 cartes maximum par deck.',
	WIZCARD_LIMIT_COLLECTION: 'Limite atteinte : 250 000 cartes maximum en collection.',
	WIZCARD_RATE_CARDS:
		'Trop de cartes ajoutées en peu de temps. Patientez quelques minutes avant de réessayer.',
};

function extractMessage(err: unknown): string {
	if (err && typeof err === 'object' && 'message' in err) {
		const m = (err as { message?: unknown }).message;
		if (typeof m === 'string') return m;
	}
	return typeof err === 'string' ? err : '';
}

/** true si l'erreur est un rejet de quota DB (message permanent, ne pas retry). */
export function isUsageLimitError(err: unknown): boolean {
	const message = extractMessage(err);
	return Object.keys(USAGE_LIMIT_MESSAGES).some((prefix) => message.includes(prefix));
}

/** Message FR lisible, ou null si ce n'est pas une erreur de quota. */
export function mapUsageLimitError(err: unknown): string | null {
	const message = extractMessage(err);
	for (const [prefix, humanMessage] of Object.entries(USAGE_LIMIT_MESSAGES)) {
		if (message.includes(prefix)) return humanMessage;
	}
	return null;
}
