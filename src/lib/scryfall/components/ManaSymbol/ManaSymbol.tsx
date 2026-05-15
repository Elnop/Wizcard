import Image from 'next/image';
import type { ScryfallCardSymbol } from '@/lib/scryfall/types/scryfall';
import styles from './ManaSymbol.module.css';

interface ManaSymbolProps {
	symbol: string;
	symbolMap: Record<string, ScryfallCardSymbol>;
	size?: number;
}

export function ManaSymbol({ symbol, symbolMap, size = 16 }: ManaSymbolProps) {
	const data = symbolMap[symbol];

	if (!data?.svg_uri) {
		return <span>{symbol}</span>;
	}

	return (
		<Image
			src={data.svg_uri}
			alt={data.english}
			width={size}
			height={size}
			className={styles.manaSymbol}
			style={{ width: size, height: size }}
			unoptimized
		/>
	);
}
