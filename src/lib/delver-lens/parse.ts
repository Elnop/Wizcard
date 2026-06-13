import type { SqlValue } from 'sql.js';
import type { PendingCard, BinaryFormatParser } from '@/lib/import/types';
import type { MtgLanguage } from '@/lib/mtg/languages';
import { SCRYFALL_CODE_TO_LANGUAGE } from '@/lib/mtg/languages';
import { openDatabase } from './sql-loader';
import {
	normalizeDelverLanguage,
	normalizeDelverCondition,
	cleanCollectorNumber,
	isIncompatibleSet,
} from './mappings';

const QUERY = `
SELECT
  cards.quantity AS amount,
  data_names.name AS card_name,
  CASE cards.foil WHEN 0 THEN '' ELSE '1' END AS is_foil,
  data_editions.tl_abb AS set_code,
  data_cards.number AS collector_number,
  NULLIF(cards.language, '') AS language,
  NULLIF(cards.condition, '') AS condition,
  strftime('%Y-%m-%d', cards.creation / 1000, 'unixepoch') AS added,
  lists.name AS collection
FROM cards
JOIN data_cards ON cards.card = data_cards._id
JOIN data_names ON data_cards.name = data_names._id
JOIN data_editions ON data_cards.edition = data_editions._id
JOIN lists ON cards.list = lists._id
`;

const REQUIRED_TABLES = ['cards', 'data_cards', 'data_names', 'data_editions', 'lists'];

function str(value: SqlValue): string {
	if (value == null) return '';
	return String(value);
}

type DedupEntry = { card: PendingCard; quantity: number };

function processSqlRow(sqlRow: SqlValue[]): { key: string; entry: DedupEntry } {
	const amount = str(sqlRow[0]);
	const cardName = str(sqlRow[1]);
	const isFoilStr = str(sqlRow[2]);
	const setCode = str(sqlRow[3]);
	const collectorNumber = str(sqlRow[4]);
	const language = str(sqlRow[5]);
	const condition = str(sqlRow[6]);
	// sqlRow[7] = dateAdded (not used currently, preserved in SQL for future use)
	const collection = str(sqlRow[8]);

	const quantity = parseInt(amount, 10) || 1;
	const foilType: 'foil' | undefined = isFoilStr === '1' ? 'foil' : undefined;
	const langCode = normalizeDelverLanguage(language || undefined);
	const normalizedLang: MtgLanguage | undefined = langCode
		? (SCRYFALL_CODE_TO_LANGUAGE[langCode] ?? undefined)
		: undefined;
	const normalizedCondition = normalizeDelverCondition(condition || undefined);
	const setLower = setCode.toLowerCase();
	const cleanedCollectorNumber = isIncompatibleSet(setLower)
		? ''
		: cleanCollectorNumber(collectorNumber);

	const key = buildDedupKey(
		cardName,
		setLower,
		cleanedCollectorNumber,
		normalizedLang ?? '',
		foilType ?? 'nonfoil',
		normalizedCondition ?? ''
	);

	return {
		key,
		entry: {
			quantity,
			card: {
				name: cardName,
				set: setLower,
				collectorNumber: cleanedCollectorNumber,
				isFoil: !!foilType,
				foilType,
				condition: normalizedCondition,
				language: normalizedLang,
				tags: collection ? [collection] : undefined,
			},
		},
	};
}

function buildDedupKey(
	name: string,
	set: string,
	collectorNumber: string,
	language: string,
	foil: string,
	condition: string
): string {
	return `${name.toLowerCase()}_${set.toLowerCase()}_${collectorNumber}_${language}_${foil}_${condition.toLowerCase()}`;
}

export const parseDelverLens: BinaryFormatParser = async (buffer) => {
	const parseErrors: string[] = [];

	let db;
	try {
		db = await openDatabase(buffer);
	} catch {
		return {
			cards: [],
			parseErrors: ['Impossible d’ouvrir le fichier comme base SQLite'],
		};
	}

	try {
		const tableResult = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
		const existingTables = new Set(
			tableResult[0]?.values.map((row: SqlValue[]) => str(row[0])) ?? []
		);
		for (const table of REQUIRED_TABLES) {
			if (!existingTables.has(table)) {
				db.close();
				return { cards: [], parseErrors: [`Table requise manquante : ${table}`] };
			}
		}

		const result = db.exec(QUERY);
		if (result.length === 0 || !result[0]) {
			db.close();
			return { cards: [], parseErrors: ['Aucune carte trouvée dans la base'] };
		}

		// Dedup by physical attributes — same card with same foil/lang/condition aggregates quantity
		const dedupMap = new Map<string, DedupEntry>();

		for (const sqlRow of result[0].values) {
			const { key, entry } = processSqlRow(sqlRow);
			const existing = dedupMap.get(key);
			if (existing) {
				existing.quantity += entry.quantity;
			} else {
				dedupMap.set(key, entry);
			}
		}

		// Expand quantity: N copies = N PendingCard entries
		const cards: PendingCard[] = [];
		for (const { card, quantity } of dedupMap.values()) {
			for (let i = 0; i < quantity; i++) {
				cards.push(card);
			}
		}

		db.close();
		return { cards, parseErrors };
	} catch (e) {
		db.close();
		return {
			cards: [],
			parseErrors: [`Erreur SQL : ${e instanceof Error ? e.message : String(e)}`],
		};
	}
};
