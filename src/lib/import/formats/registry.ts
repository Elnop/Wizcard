import { moxfieldDescriptor, parseMoxfield } from '@/lib/import/formats/moxfield';
import { mtgaDescriptor, parseMTGA } from '@/lib/import/formats/mtga';
import type {
	ImportFormatId,
	ImportFormatDescriptor,
	FormatParser,
} from '@/lib/import/utils/types';

export const FORMAT_REGISTRY: ImportFormatDescriptor[] = [moxfieldDescriptor, mtgaDescriptor];

const PARSERS: Record<ImportFormatId, FormatParser> = {
	moxfield: parseMoxfield,
	mtga: parseMTGA,
};

export function getParser(formatId: ImportFormatId): FormatParser {
	return PARSERS[formatId];
}
