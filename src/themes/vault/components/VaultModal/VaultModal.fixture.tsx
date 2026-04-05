'use client';

import { useState } from 'react';
import { VaultModal } from './VaultModal';
import { VaultButton } from '../VaultButton/VaultButton';

function ToggleModal() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<VaultButton onClick={() => setOpen(true)}>Open Modal</VaultButton>
			{open && (
				<VaultModal onClose={() => setOpen(false)}>
					<div style={{ padding: '2rem' }}>
						<h2
							style={{
								fontFamily: 'var(--font-display)',
								color: 'var(--gold)',
								marginBottom: '1rem',
							}}
						>
							The Collector&apos;s Vault
						</h2>
						<p style={{ color: 'var(--foreground)', lineHeight: 1.6 }}>
							This modal features Art Deco corner ornaments and glassmorphism backdrop.
						</p>
						<div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
							<VaultButton variant="secondary" onClick={() => setOpen(false)}>
								Close
							</VaultButton>
							<VaultButton onClick={() => setOpen(false)}>Confirm</VaultButton>
						</div>
					</div>
				</VaultModal>
			)}
		</>
	);
}

export default { 'Toggle Modal': ToggleModal };
