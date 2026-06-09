import { writeFile } from 'node:fs/promises';
import { seoLocations } from '../src/data/seoLocations.js';

const SITE_URL = 'https://deranow.com';
const API_BASE_URL = process.env.VITE_API_BASE_URL || 'https://api.deranow.com';
const outputPath = new URL('../public/sitemap.xml', import.meta.url);

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const formatDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const buildUrlEntry = ({ loc, lastmod, changefreq = 'weekly', priority = '0.7' }) => `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${formatDate(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;

const loadApprovedProperties = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/properties?status=Approved&sort=newest`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn(`[sitemap] Could not fetch approved properties: ${error.message}`);
    return [];
  }
};

const properties = await loadApprovedProperties();
const entries = [
  buildUrlEntry({
    loc: `${SITE_URL}/`,
    lastmod: new Date(),
    changefreq: 'daily',
    priority: '1.0',
  }),
  ...seoLocations.map((page) =>
    buildUrlEntry({
      loc: `${SITE_URL}/${page.slug}/`,
      lastmod: new Date(),
      changefreq: 'weekly',
      priority: '0.9',
    }),
  ),
  ...properties
    .filter((property) => property?._id)
    .map((property) =>
      buildUrlEntry({
        loc: `${SITE_URL}/property/${property._id}`,
        lastmod: property.updatedAt || property.createdAt,
        changefreq: 'weekly',
        priority: '0.8',
      }),
    ),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

await writeFile(outputPath, sitemap, 'utf8');
console.log(`[sitemap] Wrote ${entries.length} URLs to public/sitemap.xml`);
