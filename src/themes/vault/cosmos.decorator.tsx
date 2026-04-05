import './tokens.css';

function VaultDecorator({ children }: { children: React.ReactNode }) {
	return (
		<div
			data-theme="vault"
			style={{
				background: 'var(--background)',
				color: 'var(--foreground)',
				fontFamily: 'var(--font-body)',
				minHeight: '100vh',
				padding: '2rem',
			}}
		>
			{children}
		</div>
	);
}

export default VaultDecorator;
