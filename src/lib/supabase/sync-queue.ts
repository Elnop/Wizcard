import type { StackMeta } from '@/types/card';

const QUEUE_KEY = 'mtg-snap-sync-queue';

export type SyncOp =
	| {
			id: string;
			type: 'insert';
			payload: { rowId: string; userId: string; scryfallId: string; meta: StackMeta };
			retries: number;
			createdAt: string;
	  }
	| {
			id: string;
			type: 'delete';
			payload: { rowId: string; userId: string };
			retries: number;
			createdAt: string;
	  }
	| {
			id: string;
			type: 'update';
			payload: { rowIds: string[]; userId: string; meta: StackMeta };
			retries: number;
			createdAt: string;
	  }
	| {
			id: string;
			type: 'bulk-insert';
			payload: {
				userId: string;
				rows: Array<{ rowId: string; scryfallId: string; meta: StackMeta }>;
			};
			retries: number;
			createdAt: string;
	  };

function loadQueue(): SyncOp[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(QUEUE_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as SyncOp[];
	} catch {
		return [];
	}
}

function saveQueue(ops: SyncOp[]): void {
	try {
		localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
	} catch {
		// ignore quota errors
	}
}

export function enqueue(op: Omit<SyncOp, 'id' | 'retries' | 'createdAt'>): void {
	const queue = loadQueue();
	const newOp: SyncOp = {
		...op,
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		retries: 0,
		createdAt: new Date().toISOString(),
	} as SyncOp;
	queue.push(newOp);
	saveQueue(queue);
}

export function peek(): SyncOp | undefined {
	return loadQueue()[0];
}

export function dequeue(): void {
	const queue = loadQueue();
	queue.shift();
	saveQueue(queue);
}

export function incrementRetry(id: string): void {
	const queue = loadQueue();
	const op = queue.find((o) => o.id === id);
	if (op) op.retries += 1;
	saveQueue(queue);
}

export function clearFailed(maxRetries: number): void {
	const queue = loadQueue();
	saveQueue(queue.filter((op) => op.retries < maxRetries));
}

export function getFailedCount(maxRetries: number): number {
	return loadQueue().filter((op) => op.retries >= maxRetries).length;
}

export function getQueueLength(): number {
	return loadQueue().length;
}

export function clearQueue(): void {
	saveQueue([]);
}

// Move permanently-failed ops to the end of the queue so they don't block others
export function skipFailed(id: string, maxRetries: number): void {
	const queue = loadQueue();
	const idx = queue.findIndex((o) => o.id === id);
	if (idx === -1) return;
	const [op] = queue.splice(idx, 1);
	if (op.retries >= maxRetries) {
		queue.push(op);
	}
	saveQueue(queue);
}
