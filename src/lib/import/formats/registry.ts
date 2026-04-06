import { moxfieldDescriptor, parseMoxfield } from '@/lib/moxfield/import-adapter';
import { mtgaDescriptor, parseMTGA } from '@/lib/import/formats/mtga';
import { delverLensDescriptor, parseDelverLens } from '@/lib/delver-lens/import-adapter';
import type {
	ImportFormatId,
	ImportFormatDescriptor,
	FormatParser,
	BinaryFormatDescriptor,
	BinaryFormatParser,
} from '@/lib/import/utils/types';

export const FORMAT_REGISTRY: ImportFormatDescriptor[] = [moxfieldDescriptor, mtgaDescriptor];

const PARSERS: Partial<Record<ImportFormatId, FormatParser>> = {
	moxfield: parseMoxfield,
	mtga: parseMTGA,
};

export function getParser(formatId: ImportFormatId): FormatParser | undefined {
	return PARSERS[formatId];
}

export const BINARY_FORMAT_REGISTRY: BinaryFormatDescriptor[] = [delverLensDescriptor];

const BINARY_PARSERS: Partial<Record<ImportFormatId, BinaryFormatParser>> = {
	delverlens: parseDelverLens,
};

export function getBinaryParser(formatId: ImportFormatId): BinaryFormatParser | undefined {
	return BINARY_PARSERS[formatId];
}

export const ALL_FORMATS: Array<{ id: ImportFormatId; label: string }> = [
	...FORMAT_REGISTRY.map((d) => ({ id: d.id, label: d.label })),
	...BINARY_FORMAT_REGISTRY.map((d) => ({ id: d.id, label: d.label })),
];
