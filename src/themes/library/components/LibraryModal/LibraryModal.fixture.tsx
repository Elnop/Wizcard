'use client';

import { useState } from 'react';
import { LibraryModal } from './LibraryModal';
import { LibraryButton } from '../LibraryButton/LibraryButton';

function ToggleModal() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<LibraryButton onClick={() => setOpen(true)}>Open Modal</LibraryButton>
			{open && (
				<LibraryModal onClose={() => setOpen(false)}>
					<div style={{ padding: '2rem' }}>
						<h2
							style={{
								fontFamily: 'var(--font-display)',
								color: 'var(--parchment)',
								fontSize: '22px',
								marginBottom: '1rem',
							}}
						>
							The Planeswalker&apos;s Library
						</h2>
						<p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
							A warm, scholarly modal with leather-bound edges.
						</p>
						<div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
							<LibraryButton variant="secondary" onClick={() => setOpen(false)}>
								Close
							</LibraryButton>
							<LibraryButton onClick={() => setOpen(false)}>Confirm</LibraryButton>
						</div>
					</div>
				</LibraryModal>
			)}
		</>
	);
}

export default { 'Toggle Modal': ToggleModal };
