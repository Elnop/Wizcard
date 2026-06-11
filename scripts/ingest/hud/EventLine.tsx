// One event-log line:  HH:MM:SS  <icon> source  detail
// The icon comes from @inkjs/ui <StatusMessage> (variant-coloured); the timestamp
// and source are dim prefixes, and warn/error details are tinted for emphasis.

import React from 'react';
import { Box, Text } from 'ink';
import { StatusMessage, type StatusMessageProps } from '@inkjs/ui';
import type { HudEvent } from '../logger';

function variantFor(level: HudEvent['level']): StatusMessageProps['variant'] {
	if (level === 'error') return 'error';
	if (level === 'warn') return 'warning';
	return 'success';
}

function detailColor(level: HudEvent['level']): string | undefined {
	if (level === 'error') return 'red';
	if (level === 'warn') return 'yellow';
	return undefined;
}

export function EventLine({
	event,
	detailMaxLen,
}: {
	event: HudEvent;
	detailMaxLen: number;
}): React.ReactElement {
	const src = event.source ? event.source.replace('mpcfill:', '') : event.name;
	const srcLabel = src.slice(0, 12).padEnd(12);
	const detail = event.detail.slice(0, detailMaxLen);
	return (
		<Box>
			<Text dimColor>{`${event.ts}  `}</Text>
			<StatusMessage variant={variantFor(event.level)}>
				<Text dimColor>{`${srcLabel}  `}</Text>
				<Text color={detailColor(event.level)}>{detail}</Text>
			</StatusMessage>
		</Box>
	);
}
