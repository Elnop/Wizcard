// Scryfall mana symbol parsing functions

import { scryfallGet } from '../fetcher';
import type {
	ScryfallCardSymbol,
	ScryfallList,
	ScryfallColor,
	ScryfallManaCost,
} from '../types/scryfall';

export async function getAllSymbols(): Promise<ScryfallList<ScryfallCardSymbol>> {
	return scryfallGet<ScryfallList<ScryfallCardSymbol>>('/symbology');
}

export async function parseMana(cost: string): Promise<ScryfallManaCost> {
	return scryfallGet<ScryfallManaCost>('/symbology/parse-mana', { cost });
}

export async function getManaSymbols(): Promise<ScryfallCardSymbol[]> {
	const allSymbols = await getAllSymbols();
	return allSymbols.data.filter((symbol) => symbol.represents_mana);
}

export async function getSymbolsByColors(colors: string[]): Promise<ScryfallCardSymbol[]> {
	const allSymbols = await getAllSymbols();
	return allSymbols.data.filter((symbol) =>
		colors.some((color) => symbol.colors.includes(color as ScryfallColor))
	);
}

export async function getHybridSymbols(): Promise<ScryfallCardSymbol[]> {
	const allSymbols = await getAllSymbols();
	return allSymbols.data.filter((symbol) => symbol.hybrid);
}

export async function getPhyrexianSymbols(): Promise<ScryfallCardSymbol[]> {
	const allSymbols = await getAllSymbols();
	return allSymbols.data.filter((symbol) => symbol.phyrexian);
}

export async function getManaCostSymbols(): Promise<ScryfallCardSymbol[]> {
	const allSymbols = await getAllSymbols();
	return allSymbols.data.filter((symbol) => symbol.appears_in_mana_costs);
}

export async function findSymbol(symbolText: string): Promise<ScryfallCardSymbol | null> {
	const allSymbols = await getAllSymbols();
	return allSymbols.data.find((symbol) => symbol.symbol === symbolText) ?? null;
}

export async function parseManaCosts(costs: string[]): Promise<ScryfallManaCost[]> {
	return Promise.all(costs.map((cost) => parseMana(cost)));
}

export async function validateManaCost(
	cost: string
): Promise<{ isValid: boolean; parsedCost?: ScryfallManaCost; error?: string }> {
	try {
		const parsed = await parseMana(cost);
		return { isValid: true, parsedCost: parsed };
	} catch (err) {
		return {
			isValid: false,
			error: err instanceof Error ? err.message : 'Invalid mana cost',
		};
	}
}

export async function findSymbolsInText(
	text: string
): Promise<{ symbols: ScryfallCardSymbol[]; totalManaCost?: number; uniqueSymbols: string[] }> {
	const symbolMatches = text.match(/\{[^}]+\}/g) ?? [];
	const uniqueSymbolTexts = [...new Set(symbolMatches)];

	const allSymbols = await getAllSymbols();
	const foundSymbols: ScryfallCardSymbol[] = [];

	for (const symbolText of uniqueSymbolTexts) {
		const symbol = allSymbols.data.find((s) => s.symbol === symbolText);
		if (symbol) foundSymbols.push(symbol);
	}

	let totalManaCost: number | undefined;
	if (foundSymbols.every((s) => s.represents_mana)) {
		totalManaCost = foundSymbols.reduce((sum, symbol) => sum + (symbol.mana_value ?? 0), 0);
	}

	return { symbols: foundSymbols, totalManaCost, uniqueSymbols: uniqueSymbolTexts };
}

export async function createSymbolDictionary(): Promise<Record<string, ScryfallCardSymbol>> {
	const allSymbols = await getAllSymbols();
	const dictionary: Record<string, ScryfallCardSymbol> = {};

	for (const symbol of allSymbols.data) {
		dictionary[symbol.symbol] = symbol;
	}

	return dictionary;
}
