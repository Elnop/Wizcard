// Section header rule:  ┤ TITRE ├────────────────────────
// `active` highlights the rule in cyan (used to mark the focused scroll pane).

import React from 'react';
import { Text } from 'ink';

interface SectionLineProps {
	title: string;
	width: number;
	active?: boolean;
}

export function SectionLine({
	title,
	width,
	active = false,
}: SectionLineProps): React.ReactElement {
	const header = `┤ ${title} ├`;
	const line = header + '─'.repeat(Math.max(0, width - header.length));
	return active ? <Text color="cyan">{line}</Text> : <Text dimColor>{line}</Text>;
}
