/** Runs `fn` over `items` with at most `limit` calls in flight. `fn` must not throw. */
export async function mapWithConcurrency<T>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<void>
): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const item = items[next++];
			await fn(item);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
