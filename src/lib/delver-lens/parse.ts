import type { SqlValue } from 'sql.js';
import type { ParsedImportRow, BinaryFormatParser } from '@/lib/import/types';
import type { ScryfallCardIdentifier } from '@/lib/scryfall/types/scryfall';
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
			rows: [],
			parseErrors: ['Impossible d\u2019ouvrir le fichier comme base SQLite'],
			identifiers: [],
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
				return { rows: [], parseErrors: [`Table requise manquante : ${table}`], identifiers: [] };
			}
		}

		const result = db.exec(QUERY);
		if (result.length === 0 || !result[0]) {
			db.close();
			return { rows: [], parseErrors: ['Aucune carte trouv\u00e9e dans la base'], identifiers: [] };
		}

		const dedupMap = new Map<string, ParsedImportRow>();

		for (const sqlRow of result[0].values) {
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
			const foil: '' | 'foil' = isFoilStr === '1' ? 'foil' : '';
			const normalizedLang = normalizeDelverLanguage(language || undefined);
			const normalizedCondition = normalizeDelverCondition(condition || undefined);
			const cleanedCollectorNumber = cleanCollectorNumber(collectorNumber);
			const setLower = setCode.toLowerCase();

			const key = buildDedupKey(
				cardName,
				setLower,
				cleanedCollectorNumber,
				normalizedLang ?? '',
				foil || 'nonfoil',
				normalizedCondition ?? ''
			);

			const existing = dedupMap.get(key);
			if (existing) {
				existing.quantity += quantity;
			} else {
				dedupMap.set(key, {
					name: cardName,
					set: setLower,
					collectorNumber: cleanedCollectorNumber,
					quantity,
					foil,
					condition: normalizedCondition,
					language: normalizedLang,
					tags: collection ? [collection] : undefined,
				});
			}
		}

		const rows = Array.from(dedupMap.values());

		const identifiers: ScryfallCardIdentifier[] = rows.map((row) => {
			if (row.set && row.collectorNumber && !isIncompatibleSet(row.set)) {
				return {
					set: row.set,
					collector_number: row.collectorNumber,
				};
			}
			return {
				name: row.name,
				set: row.set || undefined,
			};
		});

		db.close();
		return { rows, parseErrors, identifiers };
	} catch (e) {
		db.close();
		return {
			rows: [],
			parseErrors: [`Erreur SQL : ${e instanceof Error ? e.message : String(e)}`],
			identifiers: [],
		};
	}
};
