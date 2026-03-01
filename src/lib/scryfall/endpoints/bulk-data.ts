// Scryfall bulk data metadata functions

import { scryfallGet } from '../fetcher';
import type { ScryfallBulkData, ScryfallList, ScryfallUUID } from '../types/scryfall';

export async function getAllBulkData(): Promise<ScryfallList<ScryfallBulkData>> {
	return scryfallGet<ScryfallList<ScryfallBulkData>>('/bulk-data');
}

export async function getBulkDataById(id: ScryfallUUID): Promise<ScryfallBulkData> {
	return scryfallGet<ScryfallBulkData>(`/bulk-data/${id}`);
}

export async function getBulkDataByType(
	type: 'oracle-cards' | 'unique-artwork' | 'default-cards' | 'all-cards' | 'rulings'
): Promise<ScryfallBulkData> {
	return scryfallGet<ScryfallBulkData>(`/bulk-data/${type}`);
}

export async function getAllBulkMetadata(): Promise<{
	oracleCards?: ScryfallBulkData;
	uniqueArtwork?: ScryfallBulkData;
	defaultCards?: ScryfallBulkData;
	allCards?: ScryfallBulkData;
	rulings?: ScryfallBulkData;
	totalSize: number;
	lastUpdated: string;
	availableTypes: string[];
}> {
	const allBulkData = await getAllBulkData();

	const metadata: {
		oracleCards?: ScryfallBulkData;
		uniqueArtwork?: ScryfallBulkData;
		defaultCards?: ScryfallBulkData;
		allCards?: ScryfallBulkData;
		rulings?: ScryfallBulkData;
		totalSize: number;
		lastUpdated: string;
		availableTypes: string[];
	} = {
		totalSize: 0,
		lastUpdated: '',
		availableTypes: [],
	};

	let latestUpdate = new Date(0);

	for (const bulk of allBulkData.data) {
		const updateDate = new Date(bulk.updated_at);
		if (updateDate > latestUpdate) {
			latestUpdate = updateDate;
			metadata.lastUpdated = bulk.updated_at;
		}

		metadata.totalSize += bulk.size;
		metadata.availableTypes.push(bulk.type);

		switch (bulk.type) {
			case 'oracle_cards':
				metadata.oracleCards = bulk;
				break;
			case 'unique_artwork':
				metadata.uniqueArtwork = bulk;
				break;
			case 'default_cards':
				metadata.defaultCards = bulk;
				break;
			case 'all_cards':
				metadata.allCards = bulk;
				break;
			case 'rulings':
				metadata.rulings = bulk;
				break;
		}
	}

	return metadata;
}

export async function checkBulkDataUpdates(lastKnownUpdate?: string): Promise<{
	hasUpdates: boolean;
	latestUpdate: string;
	updatedTypes: string[];
	newData: ScryfallBulkData[];
}> {
	const allBulkData = await getAllBulkData();
	const lastUpdate = lastKnownUpdate ? new Date(lastKnownUpdate) : new Date(0);

	const updatedTypes: string[] = [];
	const newData: ScryfallBulkData[] = [];
	let latestUpdate = '';

	for (const bulk of allBulkData.data) {
		const updateDate = new Date(bulk.updated_at);

		if (updateDate > lastUpdate) {
			updatedTypes.push(bulk.type);
			newData.push(bulk);
		}

		if (!latestUpdate || updateDate > new Date(latestUpdate)) {
			latestUpdate = bulk.updated_at;
		}
	}

	return {
		hasUpdates: updatedTypes.length > 0,
		latestUpdate,
		updatedTypes,
		newData,
	};
}
