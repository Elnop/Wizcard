'use client';

import { useState, useEffect } from 'react';
import { getCardCollection } from '../endpoints/cards';
import type { Card } from '@/types/cards';

interface UseCustomFallbackPrintResult {
	/** The default official print for the oracle, or null while loading / if none. */
	print: Card | null;
	loading: boolean;
}

/**
 * Resolve the default official print for a custom card that must fall back to an
 * official image (ignored tag, or broken custom image). Custom cards usually
 * carry only an `oracle_id` — no set/collector — so the localized/English image
 * hooks (which key on set+collector) can't resolve anything for them directly.
 *
 * This fetches the first print of the oracle (`unique=prints`, newest first),
 * which DOES have set/collector/image_uris, so the caller can then run the normal
 * localized → English chain on top of it. Only fetches when `enabled` — callers
 * pass `enabled` = "this is a custom card in fallback with an oracle_id" so normal
 * cards never trigger a request.
 */
export function useCustomFallbackPrint(
	oracleId: string | undefined,
	enabled: boolean
): UseCustomFallbackPrintResult {
	// Result is keyed by the oracle id it was fetched for, so a stale print from a
	// previous oracle is never surfaced for a different card (and we can derive
	// state during render without a reset-in-effect, which the strict React
	// Compiler ruleset forbids).
	const [result, setResult] = useState<{ oracleId: string; print: Card | null } | null>(null);
	const [loadingOracleId, setLoadingOracleId] = useState<string | null>(null);

	const canFetch = enabled && !!oracleId;

	useEffect(() => {
		if (!canFetch || !oracleId) return;

		const controller = new AbortController();

		const run = async () => {
			setLoadingOracleId(oracleId);
			try {
				const list = await getCardCollection([{ oracle_id: oracleId }], controller.signal);
				if (controller.signal.aborted) return;
				setResult({ oracleId, print: list.data[0] ?? null });
			} catch (err: unknown) {
				if (err instanceof DOMException && err.name === 'AbortError') return;
				if (controller.signal.aborted) return;
				setResult({ oracleId, print: null });
			} finally {
				if (!controller.signal.aborted) setLoadingOracleId(null);
			}
		};

		void run();
		return () => controller.abort();
	}, [canFetch, oracleId]);

	// Derive: only surface a print/loading state that belongs to the CURRENT
	// oracle id. A result tagged with a previous oracle is treated as absent.
	if (!canFetch) return { print: null, loading: false };
	const print = result?.oracleId === oracleId ? result.print : null;
	const loading = loadingOracleId === oracleId && print === null;
	return { print, loading };
}
