import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import sonarjs from 'eslint-plugin-sonarjs';

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	prettier,
	sonarjs.configs.recommended,
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
