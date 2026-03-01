// Scryfall API error class

import type { ScryfallError } from './types/scryfall';

export class ScryfallApiError extends Error {
	public readonly error: ScryfallError;

	constructor(error: ScryfallError) {
		super(`Scryfall API Error: ${error.details}`);
		this.name = 'ScryfallApiError';
		this.error = error;
	}

	get status(): number {
		return this.error.status;
	}

	get code(): string {
		return this.error.code;
	}

	get details(): string {
		return this.error.details;
	}

	get warnings(): string[] | undefined {
		return this.error.warnings;
	}
}

// Type guard for ScryfallError shape from API responses
export function isScryfallError(
	value: Record<string, unknown>
): value is Record<string, unknown> & ScryfallError {
	return (
		value.object === 'error' &&
		typeof value.code === 'string' &&
		typeof value.status === 'number' &&
		typeof value.details === 'string'
	);
}
