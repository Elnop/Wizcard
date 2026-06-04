import { describe, it, expect } from 'vitest';
import { parseCardFilename } from './parse-filename';

describe('parseCardFilename', () => {
	it('should parse card name with variant, bracket tags, collector number, and extension', () => {
		const result = parseCardFilename("Ancient Tomb (Balin's Tomb) [LTC] {357}.jpg");
		expect(result.cardName).toBe('Ancient Tomb');
		expect(result.variants).toEqual(["Balin's Tomb"]);
		expect(result.bracketTags).toEqual(['LTC']);
		expect(result.collectorNumber).toBe('357');
		expect(result.extension).toBe('jpg');
	});

	it('should parse card with multiple variants and bracket tags', () => {
		const result = parseCardFilename(
			'Elesh Norn, Mother of Machines (v2) [third party art, popout].png'
		);
		expect(result.cardName).toBe('Elesh Norn, Mother of Machines');
		expect(result.variants).toEqual(['v2']);
		expect(result.bracketTags).toEqual(['third party art, popout']);
		expect(result.collectorNumber).toBeNull();
		expect(result.extension).toBe('png');
	});

	it('should parse card with only bracket tags and collector number', () => {
		const result = parseCardFilename('Lightning Bolt [M10] {127}.png');
		expect(result.cardName).toBe('Lightning Bolt');
		expect(result.variants).toEqual([]);
		expect(result.bracketTags).toEqual(['M10']);
		expect(result.collectorNumber).toBe('127');
		expect(result.extension).toBe('png');
	});

	it('should parse card with only name and extension', () => {
		const result = parseCardFilename('Lightning Bolt.png');
		expect(result.cardName).toBe('Lightning Bolt');
		expect(result.variants).toEqual([]);
		expect(result.bracketTags).toEqual([]);
		expect(result.collectorNumber).toBeNull();
		expect(result.extension).toBe('png');
	});

	it('should parse card with multiple variant groups', () => {
		const result = parseCardFilename(
			'Jace, the Mind Sculptor (Extended) (Alt Art) [SLD] {123}.jpg'
		);
		expect(result.cardName).toBe('Jace, the Mind Sculptor');
		expect(result.variants).toEqual(['Extended', 'Alt Art']);
		expect(result.bracketTags).toEqual(['SLD']);
		expect(result.collectorNumber).toBe('123');
		expect(result.extension).toBe('jpg');
	});

	it('should parse card with no metadata', () => {
		const result = parseCardFilename('Ragavan, Nimble Pilferer');
		expect(result.cardName).toBe('Ragavan, Nimble Pilferer');
		expect(result.variants).toEqual([]);
		expect(result.bracketTags).toEqual([]);
		expect(result.collectorNumber).toBeNull();
		expect(result.extension).toBeNull();
	});
});
