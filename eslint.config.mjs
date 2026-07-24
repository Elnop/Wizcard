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
		// Phase 4 : search, sets.
		// Phase 5 : card (app/card + lib/card).
		// NOTE: `[locale]`, `(landing)`, `(legal)` are glob-special (character
		// class / extglob group) in ESLint flat-config `files:` patterns, so a
		// literal `src/app/[locale]/...` glob silently matches nothing. Match the
		// domain segment under any wrapper via `src/app/**/<domain>/**` instead.
		files: [
			'src/components/Navbar/**',
			'src/components/Footer/**',
			'src/components/ConfirmModal/**',
			'src/app/**/(landing)/**',
			'src/app/**/auth/**',
			'src/app/**/(legal)/**',
			'src/app/**/settings/**',
			'src/app/**/account/**',
			'src/app/**/search/**',
			'src/app/**/sets/**',
			'src/app/**/card/**',
			'src/lib/card/components/**',
			'src/app/**/collection/**',
			'src/app/**/wishlist/**',
			'src/lib/wishlist/**',
			'src/app/**/users/**',
			'src/app/**/profile/**',
			'src/app/**/decks/**',
		],
		rules: {
			'i18next/no-literal-string': [
				'error',
				{
					mode: 'jsx-text-only',
					// Termes de jeu MTG standard (non traduits, identiques fr/en) et
					// glyphes / symboles purs (icônes textuelles).
					words: {
						exclude: [
							// Symboles / glyphes purs et compteurs numériques (◆ › ⚠ inclus).
							'^\\s*[✦✎⧉▾▴→←×✕✓✨🗂🛒♡▣◆›⚠⊕+·—\\-–/#()%\\d.,:!?…\\s]*$',
							// Badge de quantité « x{n} » (le nœud texte JSX est le seul « x »).
							'^\\s*x\\s*$',
							// Liste d'extensions de fichiers acceptées (données techniques).
							'^\\s*\\.\\w+(,\\s*\\.\\w+)*\\s*$',
							// Nom de marque (identique fr/en).
							'^\\s*WIZCARD\\s*$',
							'^\\s*Wizcard\\s*$',
							// Termes de jeu MTG standard (non traduits, identiques fr/en),
							// dans leurs casses rencontrées (labels et valeurs d'<option>).
							'^\\s*(✦\\s*)?[Ff]oil\\s*$',
							'^\\s*[Ee]tched\\s*$',
							'^\\s*(▣\\s*)?[Pp]roxy\\s*$',
							'^\\s*Alter\\s*$',
							'^\\s*Trade\\s*$',
							'^\\s*Mainboard\\s*$',
							'^\\s*Sideboard\\s*$',
							'^\\s*Maybeboard\\s*$',
							'^\\s*Commander\\s*$',
							// Noms de sites / marques tierces (proper nouns, non traduits).
							'^\\s*Scryfall\\s*$',
							'^\\s*EDHREC\\s*$',
							'^\\s*Moxfield(\\s+CSV)?\\s*$',
							'^\\s*CardNexus(\\s+CSV)?\\s*$',
						],
					},
				},
			],
		},
	},
	{
		files: ['**/*.test.ts', '**/*.test.tsx'],
		rules: {
			// Standalone test scripts don't use test frameworks, so no-empty-test-file is inappropriate
			'sonarjs/no-empty-test-file': 'off',
		},
	},
	{
		// Vendor-decoupling boundary: PostHog SDKs may only be imported by the
		// adapter layer. Everything else depends on the AnalyticsClient port.
		// Replacing PostHog = rewriting providers/*, nothing else.
		ignores: ['src/lib/analytics/providers/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'posthog-js',
							message:
								'Import PostHog only inside src/lib/analytics/providers/. Use useAnalytics()/getAnalytics() elsewhere.',
						},
						{
							name: 'posthog-node',
							message:
								'Import PostHog only inside src/lib/analytics/providers/. Use trackServer() elsewhere.',
						},
					],
				},
			],
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
		'public/card-assets/v/**',
	]),
]);

export default eslintConfig;
