import type { CardEntry } from '@/types/cards';

type StoredCopy = { scryfallId: string; entry: CardEntry };
export type CollectionData = Record<string, StoredCopy>; // key = rowId
