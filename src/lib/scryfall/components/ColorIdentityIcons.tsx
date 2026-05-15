import { useScryfallSymbols } from '@/lib/scryfall/hooks/useScryfallSymbols';
import { ManaSymbol } from '@/lib/scryfall/components/ManaSymbol/ManaSymbol';

interface ColorIdentityIconsProps {
	colors: string[];
	size?: number;
	className?: string;
}

export function ColorIdentityIcons({ colors, size = 16, className }: ColorIdentityIconsProps) {
	const symbolMap = useScryfallSymbols();

	if (colors.length === 0) return null;

	return (
		<span className={className} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
			{colors.map((color) => (
				<ManaSymbol key={color} symbol={`{${color}}`} symbolMap={symbolMap} size={size} />
			))}
		</span>
	);
}
