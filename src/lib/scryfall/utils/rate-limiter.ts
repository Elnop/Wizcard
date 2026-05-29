// Scryfall request queue: serializes all API calls with 100ms spacing.
// Entries with an aborted signal are skipped; priority 'high' entries jump
// ahead of 'normal' ones (used for viewport-visible cards).

const MIN_DELAY = 100; // ms between requests

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface QueueEntry {
	run: () => Promise<unknown>;
	resolve: (v: unknown) => void;
	reject: (e: unknown) => void;
	signal?: AbortSignal;
	priority: 'high' | 'normal';
}

class ScryfallQueue {
	private queue: QueueEntry[] = [];
	private active = false;
	private lastStartTime = 0;

	enqueue<T>(
		fn: () => Promise<T>,
		signal?: AbortSignal,
		priority: 'high' | 'normal' = 'normal'
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason);
				return;
			}

			const entry: QueueEntry = {
				run: fn as () => Promise<unknown>,
				resolve: resolve as (v: unknown) => void,
				reject,
				signal,
				priority,
			};

			if (priority === 'high') {
				const insertAt = this.queue.findLastIndex((e) => e.priority === 'high') + 1;
				this.queue.splice(insertAt, 0, entry);
			} else {
				this.queue.push(entry);
			}

			void this.drain();
		});
	}

	private async drain(): Promise<void> {
		if (this.active) return;

		// Flush aborted entries without consuming the delay slot
		while (this.queue.length > 0 && this.queue[0].signal?.aborted) {
			const entry = this.queue.shift()!;
			entry.reject(entry.signal!.reason);
		}

		if (this.queue.length === 0) return;

		this.active = true;

		const now = Date.now();
		const wait = Math.max(0, MIN_DELAY - (now - this.lastStartTime));
		if (wait > 0) await delay(wait);

		// Re-check abort after the delay
		while (this.queue.length > 0 && this.queue[0].signal?.aborted) {
			const entry = this.queue.shift()!;
			entry.reject(entry.signal!.reason);
		}

		if (this.queue.length === 0) {
			this.active = false;
			return;
		}

		const entry = this.queue.shift()!;
		this.lastStartTime = Date.now();

		try {
			const result = await entry.run();
			entry.resolve(result);
		} catch (e) {
			entry.reject(e);
		} finally {
			this.active = false;
			void this.drain();
		}
	}
}

export const scryfallQueue = new ScryfallQueue();
