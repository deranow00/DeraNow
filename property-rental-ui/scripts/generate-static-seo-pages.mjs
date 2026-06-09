import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { seoLocations } from '../src/data/seoLocations.js';

const SITE_URL = 'https://deranow.com';
const distDir = new URL('../dist/', import.meta.url);
const indexPath = new URL('index.html', distDir);

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const escapeScriptJson = (value) => JSON.stringify(value).replaceAll('</script', '<\\/script');

const replaceTag = (html, pattern, replacement) => html.replace(pattern, replacement);

const buildJsonLd = (page) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      name: page.title,
          url: `${SITE_URL}/${page.slug}/`,
      description: page.description,
      about: page.keywords,
      isPartOf: {
        '@type': 'WebSite',
        name: 'DeraNow',
        alternateName: ['Dera Now', 'dera now', 'DeraNow Nepal'],
        url: SITE_URL,
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: `How do I ${page.searchLabel}?`,
          acceptedAnswer: {
            '@type': 'Answer',
            text: `Use DeraNow to search approved rentals in ${page.area}, compare rent and property details, then create an account to book visits and manage records.`,
          },
        },
        {
          '@type': 'Question',
          name: 'When is exact property location shown?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'DeraNow shows approximate location publicly and reveals exact map location after a renter books a visit for that property.',
          },
        },
      ],
    },
  ],
});

const makeStaticHtml = (baseHtml, page) => {
  const canonical = `${SITE_URL}/${page.slug}/`;
  let html = baseHtml;

  html = replaceTag(html, /<title>.*?<\/title>/s, `<title>${escapeHtml(page.title)}</title>`);
  html = replaceTag(
    html,
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
  );
  html = replaceTag(
    html,
    /<meta name="keywords" content="[^"]*" \/>/,
    `<meta name="keywords" content="${escapeHtml(page.keywords.join(', '))}" />`,
  );
  html = replaceTag(
    html,
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${canonical}" />`,
  );
  html = replaceTag(
    html,
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
  );
  html = replaceTag(
    html,
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
  );
  html = replaceTag(
    html,
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${canonical}" />`,
  );
  html = replaceTag(
    html,
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
  );
  html = replaceTag(
    html,
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
  );
  html = replaceTag(
    html,
    /<script type="application\/ld\+json">.*?<\/script>/s,
    `<script type="application/ld+json">${escapeScriptJson(buildJsonLd(page))}</script>`,
  );

  return html;
};

const baseHtml = await readFile(indexPath, 'utf8');

await Promise.all(
  seoLocations.map(async (page) => {
    const pageDir = new URL(`${page.slug}/`, distDir);
    await mkdir(pageDir, { recursive: true });
    await writeFile(new URL('index.html', pageDir), makeStaticHtml(baseHtml, page), 'utf8');
  }),
);

console.log(`[seo] Wrote ${seoLocations.length} static SEO route snapshots to dist`);
