// Centralised theme for the ingest HUD. Every @inkjs/ui component reads its
// colours from here through <ThemeProvider>, so there is a single place to tune
// the Wizcard palette instead of scattering `color=` props across the tree.

import { defaultTheme, extendTheme, type Theme } from '@inkjs/ui';

const STATUS_COLORS = {
	success: 'green',
	error: 'red',
	warning: 'yellow',
	info: 'cyan',
} as const;

type StatusVariant = keyof typeof STATUS_COLORS;

export const wizcardTheme: Theme = extendTheme(defaultTheme, {
	components: {
		// LISTING DRIVE bar — cyan fill, dimmed remaining track.
		ProgressBar: {
			styles: {
				completed: () => ({ color: 'cyan' }),
				remaining: () => ({ dimColor: true }),
			},
			config: () => ({ completedCharacter: '█', remainingCharacter: '░' }),
		},
		// ⟳ spinner on in-progress sources.
		Spinner: {
			styles: {
				frame: () => ({ color: 'cyan' }),
				label: () => ({ color: undefined }),
			},
		},
		// Compact event lines — keep the icon coloured, leave the message uncoloured
		// (warn/error get their colour applied at the call site for emphasis).
		StatusMessage: {
			styles: {
				container: () => ({ gap: 1 }),
				icon: ({ variant }: { variant: StatusVariant }) => ({ color: STATUS_COLORS[variant] }),
			},
		},
	},
});
