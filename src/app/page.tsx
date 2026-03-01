import { Hero } from '@/components/landing/Hero';
import styles from './page.module.css';

export default function Home() {
	return (
		<div className={styles.page}>
			<Hero />
		</div>
	);
}
