'use client';

import { useState } from 'react';
import { ForgeModal } from './ForgeModal';
import { ForgeButton } from '../ForgeButton/ForgeButton';

function ToggleModal() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<ForgeButton onClick={() => setOpen(true)}>Open Modal</ForgeButton>
			{open && (
				<ForgeModal onClose={() => setOpen(false)}>
					<div style={{ padding: '2rem' }}>
						<h2
							style={{
								fontFamily: 'var(--font-display)',
								color: 'var(--violet)',
								marginBottom: '1rem',
							}}
						>
							The Mana Forge
						</h2>
						<p style={{ color: 'var(--foreground)', lineHeight: 1.6 }}>
							An arcane glass modal with violet glow.
						</p>
						<div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
							<ForgeButton variant="secondary" onClick={() => setOpen(false)}>
								Close
							</ForgeButton>
							<ForgeButton onClick={() => setOpen(false)}>Confirm</ForgeButton>
						</div>
					</div>
				</ForgeModal>
			)}
		</>
	);
}

export default { 'Toggle Modal': ToggleModal };
