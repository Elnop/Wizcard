// Shared fetch functions composing rate-limiter + cache + retry + error handling

import { enforceRateLimit } from './rate-limiter';
import { getCached, setCached } from './cache';
import { ScryfallApiError, isScryfallError } from './errors';
import type { ScryfallError } from './types/scryfall';

const BASE_URL = 'https://api.scryfall.com';
const MAX_RETRIES = 3;
const TIMEOUT = 30_000;

function buildUrl(endpoint: string, params?: Record<string, string>): string {
	const url = new URL(`${BASE_URL}${endpoint}`);
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				url.searchParams.append(key, value);
			}
		}
	}
	return url.toString();
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseErrorResponse(response: Response): Promise<ScryfallError> {
	try {
		const data: Record<string, unknown> = await response.json();
		if (isScryfallError(data)) {
			return data;
		}
		return {
			object: 'error',
			code: 'unknown_error',
			status: response.status,
			details: `HTTP ${response.status}: ${response.statusText}`,
		};
	} catch {
		return {
			object: 'error',
			code: 'parse_error',
			status: response.status,
			details: `HTTP ${response.status}: ${response.statusText}`,
		};
	}
}

export async function scryfallGet<T>(
	endpoint: string,
	params?: Record<string, string>
): Promise<T> {
	const url = buildUrl(endpoint, params);

	// Check cache
	const cached = getCached<T>(url);
	if (cached !== null) {
		return cached;
	}

	await enforceRateLimit();

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

		try {
			const response = await fetch(url, {
				headers: {
					Accept: 'application/json;q=0.9,*/*;q=0.8',
				},
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorData = await parseErrorResponse(response);
				throw new ScryfallApiError(errorData);
			}

			const data: T = await response.json();
			setCached(url, data);
			return data;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Don't retry on client errors (4xx) except 429
			if (error instanceof ScryfallApiError) {
				const status = error.error.status;
				if (status >= 400 && status < 500 && status !== 429) {
					throw error;
				}
			}

			if (attempt < MAX_RETRIES) {
				await delay(Math.pow(2, attempt) * 1000);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}

	throw lastError ?? new Error('Request failed after retries');
}

export async function scryfallPost<T>(endpoint: string, body: object): Promise<T> {
	const url = buildUrl(endpoint);

	await enforceRateLimit();

	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json;q=0.9,*/*;q=0.8',
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorData = await parseErrorResponse(response);
				throw new ScryfallApiError(errorData);
			}

			const data: T = await response.json();
			return data;
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (error instanceof ScryfallApiError) {
				const status = error.error.status;
				if (status >= 400 && status < 500 && status !== 429) {
					throw error;
				}
			}

			if (attempt < MAX_RETRIES) {
				await delay(Math.pow(2, attempt) * 1000);
			}
		} finally {
			clearTimeout(timeoutId);
		}
	}

	throw lastError ?? new Error('Request failed after retries');
}
