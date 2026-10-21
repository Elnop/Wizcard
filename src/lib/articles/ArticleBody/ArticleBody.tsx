import Markdown, { type Components } from 'react-markdown';
import { Link } from '@/i18n/navigation';
import { CardImage } from '@/lib/card/components/CardImage/CardImage';
import type { ArticleCard } from '../article';
import {
	ARTICLE_SYNTAX_PLUGINS,
	DIRECTIVE_PROPS,
	type ResolvedCitations,
	remarkArticleDirectives,
} from '../directives';
import styles from './ArticleBody.module.css';

/**
 * Renders an article's Markdown body as semantic HTML.
 *
 * Raw HTML in the body is NEVER rendered: without `rehype-raw`, react-markdown
 * turns it into plain text, so a `<script>` shows as text and never runs. Unsafe
 * link protocols (`javascript:` …) are stripped by react-markdown's default
 * `urlTransform`. GitHub-flavored Markdown (tables, strikethrough, autolinks) is
 * enabled through `remark-gfm`.
 *
 * Rich directives (see `../directives.ts`) render as site components from the
 * `citations` the page resolved in one batch beforehand: `::cards` as a grid of
 * linked card images, `:card` as a link to the card, `:set` as a link to the set
 * with its icon. An unresolved card or set falls back to the plain label (and is
 * dropped from a grid; an empty grid renders nothing). Unknown or malformed
 * directives already came out of the remark plugin as their source text.
 *
 * Internal links (`/sets`) go through the locale-aware `Link`, so they keep the
 * visitor's locale: write them WITHOUT the locale prefix.
 *
 * The page already owns the `<h1>` (the article title), so a Markdown `#` heading
 * renders as `<h2>`; bodies are expected to start their sections at `##`.
 */
const baseComponents: Components = {
	h1: ({ children }) => <h2>{children}</h2>,
	a: ({ href, title, children }) => {
		if (href && /^https?:\/\//i.test(href)) {
			return (
				<a href={href} title={title} target="_blank" rel="noopener noreferrer">
					{children}
				</a>
			);
		}
		// `/path` but not protocol-relative `//host`.
		if (href && /^\/(?!\/)/.test(href)) {
			return (
				<Link href={href} title={title}>
					{children}
				</Link>
			);
		}
		return (
			<a href={href} title={title}>
				{children}
			</a>
		);
	},
};

function prop(properties: Record<string, unknown> | undefined, name: string): string | null {
	const value = properties?.[name];
	return typeof value === 'string' ? value : null;
}

function directiveComponents({ cards, sets }: ResolvedCitations<ArticleCard>): Components {
	return {
		div: ({ node, children, ...rest }) => {
			const ids = prop(node?.properties, DIRECTIVE_PROPS.cards);
			if (ids === null) return <div {...rest}>{children}</div>;
			const shown = ids
				.split(',')
				.map((id) => cards.get(id))
				.filter((card): card is ArticleCard => card !== undefined);
			if (shown.length === 0) return null;
			return (
				<div className={styles.cardGrid}>
					{shown.map((card) => (
						<Link key={card.id} href={`/card/${card.id}`} className={styles.cardLink}>
							<CardImage card={card} size="normal" className={styles.cardImage} />
						</Link>
					))}
				</div>
			);
		},
		span: ({ node, children, ...rest }) => {
			const cardId = prop(node?.properties, DIRECTIVE_PROPS.card);
			if (cardId !== null) {
				return cards.has(cardId) ? (
					<Link href={`/card/${cardId}`}>{children}</Link>
				) : (
					<>{children}</>
				);
			}
			const code = prop(node?.properties, DIRECTIVE_PROPS.set);
			if (code !== null) {
				const set = sets.get(code);
				if (!set) return <>{children}</>;
				return (
					<Link href={`/sets/${set.code}`} title={set.name} className={styles.setLink}>
						{set.iconSvgUri && (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={set.iconSvgUri} alt={set.name} className={styles.setIcon} />
						)}
						{children}
					</Link>
				);
			}
			return <span {...rest}>{children}</span>;
		},
	};
}

const NO_CITATIONS: ResolvedCitations<ArticleCard> = { cards: new Map(), sets: new Map() };

export function ArticleBody({
	markdown,
	citations = NO_CITATIONS,
}: {
	markdown: string;
	/** Cards and sets cited by the body, resolved by the page (`resolveCitations`). */
	citations?: ResolvedCitations<ArticleCard>;
}) {
	const components = { ...baseComponents, ...directiveComponents(citations) };
	return (
		<div className={styles.body}>
			<Markdown
				remarkPlugins={[...ARTICLE_SYNTAX_PLUGINS, remarkArticleDirectives]}
				components={components}
			>
				{markdown}
			</Markdown>
		</div>
	);
}
