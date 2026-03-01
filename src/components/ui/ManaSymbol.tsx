import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import styles from './ManaSymbol.module.css';

interface ManaSymbolProps {
	symbol: string;
	symbolMap: Record<string, ScryfallCardSymbol>;
}

export function ManaSymbol({ symbol, symbolMap }: ManaSymbolProps) {
	const data = symbolMap[symbol];

	if (!data?.svg_uri) {
		return <span>{symbol}</span>;
	}

	return (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={data.svg_uri} alt={data.english} className={styles.manaSymbol} />
	);
}
