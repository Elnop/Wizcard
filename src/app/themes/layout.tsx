import { Cinzel, Cormorant, Playfair_Display } from 'next/font/google';
import styles from './layout.module.css';

const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel', display: 'swap' });
const cormorant = Cormorant({ subsets: ['latin'], variable: '--font-cormorant', display: 'swap' });
const playfair = Playfair_Display({
	subsets: ['latin'],
	variable: '--font-playfair',
	display: 'swap',
});

export default function ThemesLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className={`${cinzel.variable} ${cormorant.variable} ${playfair.variable} ${styles.root}`}>
			{children}
		</div>
	);
}
