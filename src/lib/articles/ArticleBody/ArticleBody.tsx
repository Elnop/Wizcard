import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from '@/i18n/navigation';
import styles from './ArticleBody.module.css';

/**
 * Renders an article's Markdown body as semantic HTML.
 *
 * Raw HTML in the body is NEVER rendered: without `rehype-raw`, react-markdown
 * turns it into plain text, so a `<script>` shows as text and never runs. Unsafe
 * link protocols (`javascript:` …) are stripped by react-markdown's default
 * `urlTransform`. Rich directives (`::cards`, `:card`, `:set`) are not parsed yet
 * and show as written. GitHub-flavored Markdown (tables, strikethrough,
 * autolinks) is enabled through `remark-gfm`.
 *
 * Internal links (`/sets`) go through the locale-aware `Link`, so they keep the
 * visitor's locale: write them WITHOUT the locale prefix.
 *
 * The page already owns the `<h1>` (the article title), so a Markdown `#` heading
 * renders as `<h2>`; bodies are expected to start their sections at `##`.
 */
const components: Components = {
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

export function ArticleBody({ markdown }: { markdown: string }) {
	return (
		<div className={styles.body}>
			<Markdown remarkPlugins={[remarkGfm]} components={components}>
				{markdown}
			</Markdown>
		</div>
	);
}
