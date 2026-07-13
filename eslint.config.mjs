import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import i18next from 'eslint-plugin-i18next';

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	prettier,
	sonarjs.configs.recommended,
	i18next.configs['flat/recommended'],
	{
		rules: {
			// --- Maintenabilité : seuils ajustés ---
			// Seuil 20 au lieu de 15 : logique métier MTG complexe (import, sync, filtres)
			'sonarjs/cognitive-complexity': ['error', 20],
			// Min 3 occurrences : évite les faux positifs sur les noms de champs MTG répétés
			'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
			// Max 10 cases : au-delà → union type + lookup map
			'sonarjs/max-switch-cases': ['error', 10],

			// --- Fiabilité : toutes en error (déjà dans recommended, on confirme) ---
			'sonarjs/no-all-duplicated-branches': 'error',
			'sonarjs/no-element-overwrite': 'error',
			'sonarjs/no-identical-conditions': 'error',
			'sonarjs/no-use-of-empty-return-value': 'error',
			'sonarjs/no-gratuitous-expressions': 'error',
			'sonarjs/no-redundant-boolean': 'error',
			'sonarjs/no-ignored-return': 'error',

			// --- Sécurité : toutes en error ---
			'sonarjs/no-hardcoded-passwords': 'error',
			'sonarjs/no-hardcoded-secrets': 'error',
			'sonarjs/no-hardcoded-ip': 'error',
			'sonarjs/regex-complexity': 'error',
			'sonarjs/no-clear-text-protocols': 'error',

			// --- Désactivations : faux positifs systématiques ---
			// void <promise> est le pattern intentionnel pour fire-and-forget dans les contextes React
			'sonarjs/void-use': 'off',
			// Math.random() dans des contextes non-sécuritaires (visuels, jitter de retry)
			'sonarjs/pseudo-random': 'off',
			// Doublon avec @typescript-eslint/no-unused-vars déjà configuré par Next.js
			'sonarjs/no-unused-vars': 'off',

			// --- i18n ---
			// OFF par défaut : la migration i18n (extraction vers next-intl) se fait
			// domaine par domaine. On active la règle par bloc `files:` ciblé une fois
			// un domaine migré (voir bloc « i18n — domaines migrés » ci-dessous), ce
			// qui empêche toute régression sans noyer les domaines pas encore traités.
			'i18next/no-literal-string': 'off',
		},
	},
	{
		// i18n — domaines migrés : étendre ces globs au fur et à mesure de
		// l'extraction de chaque domaine vers `t()`. `mode: 'jsx-text-only'` ne
		// cible que le texte visible dans le JSX (ignore les props techniques).
		// Phase 1 : nav (Navbar), footer, common (ConfirmModal).
		// Phase 2 : landing, auth.
		// Phase 3 : legal, settings, account.
		files: [
			'src/components/Navbar/**',
			'src/components/Footer/**',
			'src/components/ConfirmModal/**',
			'src/app/[locale]/(landing)/**',
			'src/app/[locale]/auth/**',
			'src/app/[locale]/(legal)/**',
			'src/app/[locale]/settings/**',
			'src/app/[locale]/account/**',
		],
		rules: {
			'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
		},
	},
	{
		files: ['**/*.test.ts', '**/*.test.tsx'],
		rules: {
			// Standalone test scripts don't use test frameworks, so no-empty-test-file is inappropriate
			'sonarjs/no-empty-test-file': 'off',
		},
	},
	globalIgnores([
		'.next/**',
		'.claude/worktrees/**',
		'out/**',
		'build/**',
		'tmp/**',
		'next-env.d.ts',
		'cosmos-export/**',
		'cosmos.imports.ts',
	]),
]);

export default eslintConfig;
