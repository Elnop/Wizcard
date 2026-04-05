'use client';

import { useState } from 'react';
import { VaultConfirmModal } from './VaultConfirmModal';
import { VaultButton } from '../VaultButton/VaultButton';

function ToggleConfirm() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<VaultButton variant="danger" onClick={() => setOpen(true)}>
				Delete Item
			</VaultButton>
			{open && (
				<VaultConfirmModal
					message="Are you sure you want to remove this card from the vault? This action cannot be undone."
					confirmLabel="Remove"
					onConfirm={() => setOpen(false)}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

export default { 'Toggle Confirm': ToggleConfirm };
