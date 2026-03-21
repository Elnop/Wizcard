import { LoginForm } from './LoginForm';
import styles from './page.module.css';

export default function LoginPage() {
	return (
		<div className={styles.page}>
			<div className={styles.card}>
				<h1 className={styles.title}>Se connecter</h1>
				<LoginForm />
			</div>
		</div>
	);
}
