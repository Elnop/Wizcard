'use client';

import { useState } from 'react';
import { ForgeConfirmModal } from './ForgeConfirmModal';
import { ForgeButton } from '../ForgeButton/ForgeButton';

function ToggleConfirm() {
	const [open, setOpen] = useState(false);
	return (
		<>
			<ForgeButton variant="danger" onClick={() => setOpen(true)}>
				Delete Item
			</ForgeButton>
			{open && (
				<ForgeConfirmModal
					message="Are you sure you want to disenchant this card?"
					confirmLabel="Disenchant"
					onConfirm={() => setOpen(false)}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

export default { 'Toggle Confirm': ToggleConfirm };
