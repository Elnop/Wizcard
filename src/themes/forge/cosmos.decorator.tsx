import './tokens.css';

function ForgeDecorator({ children }: { children: React.ReactNode }) {
	return (
		<div
			data-theme="forge"
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

export default ForgeDecorator;
