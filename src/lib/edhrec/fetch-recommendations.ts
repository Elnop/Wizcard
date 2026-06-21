import { convertEdhrecRecommendations } from './convert-recommendations';
import type { EdhrecCommanderResponse, EdhrecSection } from './types';

/**
 * Fetch EDHREC recommendations for a commander slug via our internal proxy
 * route (which forwards to json.edhrec.com and caches the response).
 *
 * Throws on a missing commander (404) or any non-OK response.
 */
export async function fetchEdhrecRecommendations(slug: string): Promise<EdhrecSection[]> {
	const res = await fetch(`/api/edhrec/commander/${encodeURIComponent(slug)}`);

	if (res.status === 404) {
		throw new Error('No EDHREC data found for this commander.');
	}
	if (!res.ok) {
		throw new Error(`EDHREC API error (${res.status})`);
	}

	const data = (await res.json()) as EdhrecCommanderResponse;
	return convertEdhrecRecommendations(data);
}
