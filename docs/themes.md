# Theme System

Wizcard has three visual themes — each a complete design direction with its own color palette, component variants, and landing page. They are currently used as design showcases and prototypes, not yet user-selectable at runtime.

| Theme   | Identity                   | Primary color    | Aesthetic                      |
| ------- | -------------------------- | ---------------- | ------------------------------ |
| Forge   | The Mana Forge             | Violet `#7c3aed` | Dark mystical, arcane purple   |
| Library | The Planeswalker's Library | Burgundy         | Classic, warm, parchment tones |
| Vault   | The Collector's Vault      | Gold `#c9a84c`   | Art Deco, brass and glass      |

## Directory Structure

Each theme follows the same structure under `src/themes/`:

```
src/themes/
├── _shared/                    # Shared across all themes
│   ├── types.ts                # Re-exported prop interfaces from base components
│   ├── mockData.ts             # Mock data for theme demos
│   ├── useScrollReveal.ts      # Scroll-reveal animation hook
│   ├── scrollReveal.module.css
│   └── CosmosLink.tsx          # Navigation link for Cosmos fixtures
│
├── forge/
│   ├── tokens.css              # CSS custom properties — activated by [data-theme='forge']
│   ├── cosmos.decorator.tsx    # Cosmos wrapper (applies data-theme + tokens.css)
│   ├── components/             # Themed component variants
│   │   ├── ForgeButton/
│   │   ├── ForgeModal/
│   │   ├── ForgeConfirmModal/
│   │   ├── ForgeSearchBar/
│   │   ├── ForgeSpinner/
│   │   ├── ForgeColorFilter/
│   │   ├── ForgeRarityFilter/
│   │   ├── ForgeCardFrame/
│   │   └── ForgeCardGrid/
│   └── homepage/               # Theme-specific landing page sections
│       ├── ForgeHero.tsx
│       ├── ForgeFeatures.tsx
│       ├── ForgeShowcase.tsx
│       └── ForgeCTA.tsx
│
├── library/                    # Same structure as forge
└── vault/                      # Same structure as forge
```

Route shells live in `src/app/themes/<theme>/homepage/page.tsx` — they import section components from `src/themes/<theme>/homepage/`.

## Design Tokens

Each theme defines a `tokens.css` file with CSS custom properties scoped via `[data-theme='<theme>']`:

```css
[data-theme='forge'] {
	/* Base — overrides globals.css defaults */
	--background: #0a0a14;
	--foreground: #e0e0f0;
	--primary: #7c3aed;
	--surface: #14142a;
	--border: #2a2a4e;
	--text-muted: #8888aa;

	/* Theme-specific accents */
	--indigo: #4338ca;
	--arcane-gold: #d4a845;
	--glass-bg: rgba(20, 20, 42, 0.7);
	--glass-border: rgba(124, 58, 237, 0.2);

	/* Mana colors + glow variants */
	--mana-white: #f8e7b9;
	--mana-glow-white: rgba(248, 231, 185, 0.4);
	/* … */

	/* Functional */
	--success: #22c55e;
	--warning: #d4a845;
	--error: #ef4444;

	/* Typography */
	--font-display: var(--font-cinzel), 'Georgia', serif;
	--font-body: var(--font-geist-sans), 'Arial', sans-serif;
}
```

**Token categories:**

| Category       | Examples                                 | Purpose                       |
| -------------- | ---------------------------------------- | ----------------------------- |
| Base           | `--background`, `--primary`, `--surface` | Override global defaults      |
| Theme-specific | `--arcane-gold`, `--deep-purple`         | Unique accents per theme      |
| Glassmorphism  | `--glass-bg`, `--glass-border`           | Translucent surface effects   |
| Mana colors    | `--mana-white`, `--mana-blue`            | MTG color identity            |
| Mana glows     | `--mana-glow-white`                      | Glow effects for mana symbols |
| Functional     | `--success`, `--warning`, `--error`      | Status colors                 |
| Typography     | `--font-display`, `--font-body`          | Font stacks                   |

## Shared Interfaces

`src/themes/_shared/types.ts` re-exports prop types from base components (`ButtonProps`, `SpinnerProps`, `SearchBarProps`, etc.) and defines additional interfaces (`ModalProps`, `ConfirmModalProps`, `ColorFilterProps`, `CardFrameProps`, `CardGridProps`).

Themed variants implement these interfaces, ensuring consistency. For example, `ForgeButton` accepts the same `ButtonProps` as the base `Button` component.

## Component Naming Convention

Themed components follow the pattern `<Theme><Component>`:

- `ForgeButton`, `LibraryButton`, `VaultButton`
- `ForgeModal`, `LibraryModal`, `VaultModal`

Each themed component gets its own folder with `.tsx` + `.module.css` + `.fixture.tsx`.

## Cosmos Integration

Each theme has a `cosmos.decorator.tsx` that wraps fixture content in the theme context:

```tsx
import './tokens.css';

function ForgeDecorator({ children }: { children: React.ReactNode }) {
	return (
		<div data-theme="forge" style={{ background: 'var(--background)' /* … */ }}>
			{children}
		</div>
	);
}
export default ForgeDecorator;
```

Fixtures are `*.fixture.tsx` files alongside their component. Cosmos auto-discovers them and renders via the `/cosmos/[fixture]` route.

## Adding a New Theme

1. Create `src/themes/<name>/tokens.css` with `[data-theme='<name>']` selector
2. Create `src/themes/<name>/cosmos.decorator.tsx` importing `tokens.css`
3. Implement component variants in `src/themes/<name>/components/` following `<Theme><Component>` naming
4. Add homepage sections in `src/themes/<name>/homepage/`
5. Add route shell at `src/app/themes/<name>/homepage/page.tsx`
6. Add theme entry to the picker in `src/app/themes/page.tsx`
