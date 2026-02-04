# CLAUDE.md

## Development Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — ESLint (flat config with core-web-vitals + typescript + prettier)
- `npm run format` — format all files with Prettier
- `npm run format:check` — check formatting without writing

## Architecture

- Next.js 16 with App Router (`src/app/`)
- TypeScript strict mode, path alias `@/*` → `./src/*`
- React Compiler enabled (`reactCompiler: true` in next.config.ts)
- CSS Modules for component styles, global CSS in `src/app/globals.css`
- ESLint flat config (`eslint.config.mjs`) extending core-web-vitals, typescript, and prettier

## Code Style

- **Prettier** for formatting (config in `.prettierrc.json`)
- **Tabs** for indentation (tab width: 2), single quotes, trailing commas (es5)
- **Husky + lint-staged** pre-commit hook runs ESLint + Prettier on staged files
- JSON/YAML files use spaces (2) per `.editorconfig`
