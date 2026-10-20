import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	articleLanguageFor,
	filterArticles,
	isArticleCategory,
	localized,
	markdownExcerpt,
	rowToArticle,
} from './article';

test('isArticleCategory accepts the three known categories', () => {
	for (const c of ['catalogue', 'magic', 'site']) assert.equal(isArticleCategory(c), true);
});

test('isArticleCategory rejects unknown, empty, cased and non-string values', () => {
	for (const c of ['news', '', 'Catalogue', ' site', undefined, null, 3, ['site']]) {
		assert.equal(isArticleCategory(c), false, String(c));
	}
});

test('articleLanguageFor: fr -> fr, en and anything else -> en', () => {
	assert.equal(articleLanguageFor('fr'), 'fr');
	assert.equal(articleLanguageFor('en'), 'en');
	assert.equal(articleLanguageFor('de'), 'en');
});

test('localized picks the visitor language', () => {
	const text = { fr: 'Bonjour', en: 'Hello' };
	assert.equal(localized(text, 'fr'), 'Bonjour');
	assert.equal(localized(text, 'en'), 'Hello');
});

const row = {
	slug: 'a',
	category: 'catalogue',
	title_fr: 'Titre',
	title_en: 'Title',
	body_fr: 'Corps',
	body_en: 'Body',
	published_at: '2026-10-20T00:00:00Z',
};

test('rowToArticle maps a row', () => {
	assert.deepEqual(rowToArticle(row), {
		slug: 'a',
		category: 'catalogue',
		title: { fr: 'Titre', en: 'Title' },
		body: { fr: 'Corps', en: 'Body' },
		publishedAt: '2026-10-20T00:00:00Z',
	});
});

test('rowToArticle drops a row with an unknown category', () => {
	assert.equal(rowToArticle({ ...row, category: 'other' }), null);
});

test('markdownExcerpt strips Markdown and HTML', () => {
	assert.equal(
		markdownExcerpt('## Heading\n\n- **bold** item\n- [link](https://x.y)\n\n<script>x</script>'),
		'Heading bold item link x'
	);
});

test('markdownExcerpt cuts long text on a word boundary', () => {
	const out = markdownExcerpt('word '.repeat(100), 30);
	assert.ok(out.length <= 30, out);
	assert.ok(out.endsWith('word…'), out);
});

const items = [
	{ slug: 'c', category: 'catalogue' as const },
	{ slug: 'm', category: 'magic' as const },
];

test('filterArticles: no active category keeps every article', () => {
	assert.deepEqual(filterArticles(items, null), { shown: items, emptyKey: null });
});

test('filterArticles: an active category keeps only that category', () => {
	assert.deepEqual(filterArticles(items, 'magic'), { shown: [items[1]], emptyKey: null });
});

test('filterArticles: an empty category -> emptyCategory', () => {
	assert.deepEqual(filterArticles(items, 'site'), { shown: [], emptyKey: 'emptyCategory' });
});

test('filterArticles: no article at all -> empty', () => {
	assert.deepEqual(filterArticles([], null), { shown: [], emptyKey: 'empty' });
	assert.deepEqual(filterArticles([], 'site'), { shown: [], emptyKey: 'empty' });
});
