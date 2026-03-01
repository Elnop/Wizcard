// Shared rate limiter for Scryfall API requests (100ms between requests)

const REQUEST_DELAY = 100; // ms
let lastRequestTime = 0;

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enforceRateLimit(): Promise<void> {
	const timeSinceLastRequest = Date.now() - lastRequestTime;
	if (timeSinceLastRequest < REQUEST_DELAY) {
		await delay(REQUEST_DELAY - timeSinceLastRequest);
	}
	lastRequestTime = Date.now();
}
