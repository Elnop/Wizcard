import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';

interface SymbolTextProps {
	text: string;
	symbolMap: Record<string, ScryfallCardSymbol>;
}

export function SymbolText({ text, symbolMap }: SymbolTextProps) {
	// eslint-disable-next-line sonarjs/slow-regex -- mana symbol strings are short, no ReDoS risk
	const parts = text.split(/(\{[^}]+\})/g);

	return (
		<>
			{parts.map((part, index) =>
				/^\{[^}]+\}$/.test(part) ? (
					<ManaSymbol key={index} symbol={part} symbolMap={symbolMap} />
				) : (
					<span key={index}>{part}</span>
				)
			)}
		</>
	);
}
