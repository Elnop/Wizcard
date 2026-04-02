import Image from 'next/image';
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
		<Image
			src={data.svg_uri}
			alt={data.english}
			width={16}
			height={16}
			className={styles.manaSymbol}
			unoptimized
		/>
	);
}
