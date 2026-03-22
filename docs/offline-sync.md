# Offline Sync

MTG Snap uses an **offline-first** model: all collection mutations are written to localStorage immediately, then synced to Supabase asynchronously.

## Architecture

```
User action (addCard, removeEntry, updateEntry, ...)
    │
    ▼
useCollection.ts — mutates localStorage snapshot
    │
    ├─→ enqueue(SyncOp)         ← logs the operation
    └─→ triggerSync()           ← wakes up SyncQueueRunner
            │
            ▼
    SyncQueueRunner — peek → process → dequeue (one op at a time)
            │
            ▼
    collection.ts — insertEntry / deleteEntryById / updateEntry / insertEntries
            │
            ▼
    Supabase PostgreSQL
```

## SyncOp Types (`src/lib/supabase/sync-queue.ts`)

```typescript
type SyncOp =
	| { type: 'insert'; payload: { rowId; userId; scryfallId; entry } }
	| { type: 'delete'; payload: { rowId; userId } }
	| { type: 'update'; payload: { rowId; userId; entry } }
	| { type: 'bulk-insert'; payload: { userId; rows: Array<{ rowId; scryfallId; entry }> } };
```

Each op also has `id`, `retries`, and `createdAt`.

## Queue Processing

The `SyncQueueRunner` component (`src/lib/supabase/components/SyncQueueRunner.tsx`) drives the sync loop:

1. **peek()** — read the first op without removing it
2. **process** — call the appropriate Supabase function
3. **dequeue()** — remove the op on success
4. **incrementRetry(id)** — on failure, increment retry count
5. **skipFailed(id, maxRetries)** — if `retries >= maxRetries`, move op to end of queue so it doesn't block others

Failed ops are not automatically deleted — use `clearFailed(maxRetries)` to clean them up.

## Login Merge Strategy

When a user logs in, `useCollection.ts` fetches the remote collection from Supabase and merges it with local state:

- **Remote wins** for entries with the same `rowId` (the DB is authoritative)
- **Local-only entries** (not in remote) are uploaded via a `bulk-insert` SyncOp

This ensures that:

- Changes made on another device are not overwritten by stale local data
- Offline additions made before login are persisted to Supabase

## Logout Behavior

On logout, the `mtg-snap-signed-in` flag is cleared from localStorage. On the next page load, `useCollection.ts` detects the absence of this flag and wipes the local collection, preventing stale data from showing for the next user (or the same user after re-login).

## Key Functions (`src/lib/supabase/sync-queue.ts`)

| Function                     | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `enqueue(op)`                | Add an op to the end of the queue                      |
| `peek()`                     | Read the first op without removing it                  |
| `dequeue()`                  | Remove the first op (call after successful processing) |
| `incrementRetry(id)`         | Increment retry count for an op                        |
| `skipFailed(id, maxRetries)` | Move a permanently-failed op to the end                |
| `clearFailed(maxRetries)`    | Remove all ops that exceeded maxRetries                |
| `getQueueLength()`           | Current queue size                                     |
| `clearQueue()`               | Wipe the queue entirely                                |

> Always call `triggerSync()` after `enqueue()`. The queue does not process itself automatically.
