// In-memory bridge between Stage 1 (parse+insert, producer) and Stage 2 (Scryfall
// enrich, single consumer). Stage 1 pushes each inserted un-enriched card; the
// worker pulls batches. `pull` resolves immediately if items are available, waits
// if empty and open, and resolves to [] once the queue is closed AND drained.

import type { PendingCard } from './types';

export interface EnrichQueue {
	push(card: PendingCard): void;
	pull(max: number): Promise<PendingCard[]>;
	close(): void;
	size(): number;
	isDone(): boolean;
}

export function createEnrichQueue(): EnrichQueue {
	const buffer: PendingCard[] = [];
	let closed = false;
	let waiter: (() => void) | null = null;

	function wake(): void {
		const w = waiter;
		waiter = null;
		if (w) w();
	}

	return {
		push(card: PendingCard): void {
			buffer.push(card);
			wake();
		},
		async pull(max: number): Promise<PendingCard[]> {
			while (buffer.length === 0 && !closed) {
				await new Promise<void>((resolve) => {
					waiter = resolve;
				});
			}
			return buffer.splice(0, max);
		},
		close(): void {
			closed = true;
			wake();
		},
		size(): number {
			return buffer.length;
		},
		isDone(): boolean {
			return closed && buffer.length === 0;
		},
	};
}
