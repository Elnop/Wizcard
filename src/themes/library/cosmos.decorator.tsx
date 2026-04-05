import './tokens.css';

function LibraryDecorator({ children }: { children: React.ReactNode }) {
	return (
		<div
			data-theme="library"
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

export default LibraryDecorator;
